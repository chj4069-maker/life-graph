const https = require("https");

function callAnthropic(apiKey, prompt) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
    });
    var options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    var req = https.request(options, function (res) {
      var data = "";
      res.on("data", function (chunk) { data += chunk; });
      res.on("end", function () {
        try {
          var parsed = JSON.parse(data);
          if (res.statusCode !== 200) reject(new Error("API " + res.statusCode + ": " + data));
          else resolve(parsed);
        } catch (e) { reject(new Error("Parse error: " + data.substring(0, 200))); }
      });
    });
    req.on("error", function (e) { reject(e); });
    req.write(body);
    req.end();
  });
}

exports.handler = async function (event) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: headers, body: JSON.stringify({ error: "Method not allowed" }) };

  var API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };

  try {
    var input = JSON.parse(event.body);
    var name = input.name;
    var dataPoints = input.dataPoints;

    var graphSummary = dataPoints.map(function (p) {
      return p.age + "세: " + (p.score > 0 ? "+" : "") + p.score + (p.memo ? " (" + p.memo + ")" : "");
    }).join("\n");

    var scores = dataPoints.map(function(p) { return p.score; });
    var ages = dataPoints.map(function(p) { return p.age; });
    var minScore = Math.min.apply(null, scores);
    var maxScore = Math.max.apply(null, scores);
    var minIdx = scores.indexOf(minScore);
    var maxIdx = scores.indexOf(maxScore);

    var turns = [];
    for (var i = 1; i < scores.length - 1; i++) {
      if ((scores[i] > scores[i-1] && scores[i] > scores[i+1]) || (scores[i] < scores[i-1] && scores[i] < scores[i+1])) {
        turns.push(dataPoints[i]);
      }
    }
    var bigChanges = [];
    for (var j = 1; j < scores.length; j++) {
      var diff = Math.abs(scores[j] - scores[j-1]);
      if (diff >= 5) bigChanges.push({ from: dataPoints[j-1], to: dataPoints[j], diff: scores[j] - scores[j-1] });
    }

    // 극단적 순간 식별
    var extremeMoments = dataPoints.filter(function(p) { return p.score <= -7 || p.score >= 8; });

    var meta = "분석 참고:\n";
    meta += "- 데이터 포인트: " + dataPoints.length + "개, 나이: " + ages[0] + "세~" + ages[ages.length-1] + "세\n";
    meta += "- 최저점: " + dataPoints[minIdx].age + "세 " + minScore + "점" + (dataPoints[minIdx].memo ? " (" + dataPoints[minIdx].memo + ")" : "") + "\n";
    meta += "- 최고점: " + dataPoints[maxIdx].age + "세 " + maxScore + "점" + (dataPoints[maxIdx].memo ? " (" + dataPoints[maxIdx].memo + ")" : "") + "\n";
    if (turns.length > 0) meta += "- 변곡점: " + turns.map(function(t) { return t.age + "세(" + t.score + ")"; }).join(", ") + "\n";
    if (bigChanges.length > 0) meta += "- 급변 구간: " + bigChanges.map(function(c) { return c.from.age + "세->" + c.to.age + "세(" + (c.diff > 0 ? "+" : "") + c.diff + ")"; }).join(", ") + "\n";
    if (extremeMoments.length > 0) meta += "- 극단적 순간: " + extremeMoments.map(function(e) { return e.age + "세(" + e.score + ")" + (e.memo ? " " + e.memo : ""); }).join(", ") + "\n";

    var prompt = "";
    prompt += "당신은 의료인문학 강의('고통이란 무엇인가')에서 의대생의 인생 그래프를 읽어주는 역할입니다.\n\n";
    prompt += "학생 이름: " + name + "\n\n";
    prompt += "인생 그래프 데이터 (나이: 점수 -10=극심한 고통, +10=큰 행복):\n" + graphSummary + "\n\n";
    prompt += meta + "\n";

    prompt += "===핵심 원칙===\n";
    prompt += "이 응답에서 가장 중요한 것은 '개별성'입니다. 이 학생이 적은 구체적인 순간들(나이, 점수, 메모)을 직접 언급하고, 그 순간들 사이의 관계와 흐름을 읽어내세요. 학생이 '나를 정확히 읽어냈다'고 느낄 수 있어야 합니다. 이론은 양념이고, 이 학생의 이야기가 주인공입니다.\n\n";

    prompt += "다음 두 부분으로 나누어 응답하세요. 한국어로 작성하세요.\n\n";

    // 그래프 해석
    prompt += "[그래프 해석]\n";
    prompt += "이 학생의 그래프를 세밀하게 읽어주세요 (1문단, 6~8문장):\n";
    prompt += "- 전체 궤적의 형상을 이름 붙이세요 (V자형, U자형, 롤러코스터형, 계단식 하강 등)\n";
    prompt += "- 학생이 적은 메모가 있는 순간들을 구체적으로 언급하세요. '15세에 적은 ~라는 경험'처럼.\n";
    prompt += "- 결정적 변곡점에서 무슨 일이 일어났는지, 그 전후가 어떻게 달라지는지\n";
    prompt += "- 고통이 한 번 왔다가 간 것인지, 오래 머문 것인지, 반복된 것인지\n";
    prompt += "- 극단적으로 낮은 점수(-7 이하)가 있다면, 그 순간을 가볍게 넘기지 말고 충분히 무게를 두어 다뤄주세요\n";
    prompt += "- 마지막 데이터 포인트가 이 학생의 '지금'에 대해 무엇을 말해주는지\n\n";

    // 철학적 조언 3문단
    prompt += "[철학적 조언]\n\n";

    prompt += "첫째 문단 - 순간들 사이의 대화 (5~7문장):\n";
    prompt += "- 이 학생의 기록된 순간들을 서로 비교하고 연결하세요. 예를 들어 '14세의 그 순간과 21세의 그 순간 사이에는 ~한 공명이 있다' 같은 식으로.\n";
    prompt += "- 행복했던 순간과 고통스러웠던 순간이 서로에게 어떤 의미를 주는지\n";
    prompt += "- 극단적으로 힘들었던 순간에는 진정성 있게 공감하세요. 교과서적 위로가 아니라, 그 순간이 얼마나 무거웠을지를 인정하는 방식으로\n";
    prompt += "- 여기서 철학자 한 명의 개념을 짧게(1~2문장) 빌려오세요. 이론 설명이 아니라, 학생의 경험을 비추는 렌즈로서만 사용. 예: 'Camus가 말한 부조리란 바로 이런 순간 — ~할 때 ~ 한 것처럼' 정도.\n\n";

    prompt += "사용 가능한 철학자 풀 (하나만 골라서 짧게):\n";
    prompt += "Nietzsche(운명애, 자기극복), Schopenhauer(고통의 본질), Canguilhem(새로운 규범 창조), Arthur Frank(서사유형), Viktor Frankl(의미발견), Havi Carel(건강의 현상학), Levinas(타자의 고통), Merleau-Ponty(체화된 경험), Heidegger(실존적 각성), Kierkegaard(절망과 도약), Simone Weil(고통과 주의력), Arendt(새로운 시작), Ricoeur(서사적 정체성), Butler(취약성), Deleuze(되기), Camus(부조리와 반항), 스토아학파(통제의 구분), 불교(고와 무상)\n";
    prompt += "매번 다른 철학자를 선택하세요.\n\n";

    prompt += "둘째 문단 - 고통이 가르쳐준 것 (5~7문장):\n";
    prompt += "- 첫째 문단에서 꺼낸 철학적 렌즈를 이 학생의 전체 흐름에 적용하세요\n";
    prompt += "- 핵심: 고통 '이후'에 이 학생에게 무엇이 달라졌는지 (혹은 달라지지 않았는지)를 그래프에서 읽어주세요\n";
    prompt += "- 추상적으로 '고통에는 의미가 있다'라고 말하지 마세요. 대신, 이 학생의 구체적 흐름에서 보이는 것을 말하세요\n";
    prompt += "- 고통과 행복이 교차하는 패턴, 또는 긴 고통 뒤의 변화, 또는 아직 회복 중인 상태 등 — 이 학생의 이야기에서 실제로 보이는 것만 언급하세요\n\n";

    prompt += "셋째 문단 - 의료인으로서 (4~6문장):\n";
    prompt += "- 교과서적으로 '환자의 고통에 공감하는 의사가 되세요' 같은 말은 하지 마세요\n";
    prompt += "- 대신, 이 학생의 구체적 경험과 의료 상황을 연결하세요. 예: 급격한 하락을 경험한 학생에게는 '언젠가 병실에서 하룻밤 사이에 상태가 급변한 환자를 만났을 때, 그 순간이 얼마나 파괴적인지를 몸으로 아는 의사가 될 것이다' 같은 식\n";
    prompt += "- 이 학생만의 경험이 의료인으로서 어떤 고유한 감수성을 줄 수 있는지\n";
    prompt += "- 마지막 문장: 이 학생에게만 건네는 한 마디. 진부하지 않은 것. 조용한 인정이든, 질문이든, 격려든.\n\n";

    prompt += "톤:\n";
    prompt += "- 진단하지 마세요. 상담하지 마세요.\n";
    prompt += "- '~했군요', '~이시군요' 금지.\n";
    prompt += "- 사려 깊은 선배가 조용히 건네는 말.\n";
    prompt += "- 철학자 이름은 자연스러운 맥락 속에서 1~2회만.\n";
    prompt += "- 이름(" + name + ")을 직접 부르지 마세요.\n";
    prompt += "- 전체 분량: 그래프 해석 1문단 + 철학적 조언 3문단 = 총 4문단, 약 800~1200자.";

    var data = await callAnthropic(API_KEY, prompt);
    var text = data.content.filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n");
    return { statusCode: 200, headers: headers, body: JSON.stringify({ interpretation: text }) };
  } catch (err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
