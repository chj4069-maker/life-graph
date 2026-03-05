const https = require("https");

function callAnthropic(apiKey, prompt) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
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

    // 그래프 패턴 메타데이터 계산
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

    var meta = "분석 참고 메타데이터:\n";
    meta += "- 데이터 포인트: " + dataPoints.length + "개, 나이 범위: " + ages[0] + "세~" + ages[ages.length-1] + "세\n";
    meta += "- 최저점: " + dataPoints[minIdx].age + "세 " + minScore + "점" + (dataPoints[minIdx].memo ? " (" + dataPoints[minIdx].memo + ")" : "") + "\n";
    meta += "- 최고점: " + dataPoints[maxIdx].age + "세 " + maxScore + "점" + (dataPoints[maxIdx].memo ? " (" + dataPoints[maxIdx].memo + ")" : "") + "\n";
    if (turns.length > 0) meta += "- 변곡점: " + turns.map(function(t) { return t.age + "세(" + t.score + ")"; }).join(", ") + "\n";
    if (bigChanges.length > 0) meta += "- 급변 구간: " + bigChanges.map(function(c) { return c.from.age + "세->" + c.to.age + "세(" + (c.diff > 0 ? "+" : "") + c.diff + ")"; }).join(", ") + "\n";

    var prompt = "";
    prompt += "당신은 의료인문학 강의에서 '고통이란 무엇인가'라는 주제를 다루는 맥락에서, 의대생이 그린 자신의 인생 그래프를 해석해주는 역할입니다. 의철학, 서사의학, 현상학적 질병 경험론에 깊은 조예가 있습니다.\n\n";
    prompt += "학생 이름: " + name + "\n\n";
    prompt += "인생 그래프 데이터 (나이: 행복<->고통 점수, -10=극심한 고통, +10=큰 행복):\n" + graphSummary + "\n\n";
    prompt += meta + "\n";
    prompt += "다음 두 부분으로 나누어 응답하세요. 반드시 한국어로 작성하세요.\n\n";

    // 그래프 해석
    prompt += "[그래프 해석]\n";
    prompt += "이 학생의 인생 그래프를 구체적이고 세밀하게 읽어주세요:\n";
    prompt += "1) 전체 궤적의 형상: 이 그래프가 어떤 이야기의 형태를 가지고 있는지 구체적으로 명명하세요 (V자형 회복, 점진적 하강, 롤러코스터형, U자 곡선, 상승 후 정체 등).\n";
    prompt += "2) 결정적 변곡점: 가장 큰 변화가 일어난 시기를 구체적으로 짚고, 그 변화의 폭과 방향이 무엇을 시사하는지 해석하세요. 학생이 적은 메모가 있다면 반드시 참조하세요.\n";
    prompt += "3) 고통의 지속 패턴: 고통이 순간적이었는지, 지속적이었는지, 반복되었는지, 회복의 속도는 어땠는지.\n";
    prompt += "4) 현재 위치: 그래프의 마지막 지점이 이 학생의 현재 상태에 대해 무엇을 말해주는지.\n";
    prompt += "분량: 1문단, 6~8문장. 구체적 나이와 점수를 인용하며 분석하세요.\n\n";

    // 철학적 조언 - 하나의 철학자를 깊게
    prompt += "[철학적 조언]\n";
    prompt += "중요: 아래 지침을 정확히 따르세요.\n\n";

    prompt += "STEP 1 - 철학자 선택 (출력하지 않음):\n";
    prompt += "아래 사상가 목록에서 이 학생의 그래프 패턴에 가장 깊이 있게 연결될 수 있는 사상가 한 명만 고르세요. 억지 끼워맞추기가 아니라, 이 학생의 경험 패턴이 그 사상가의 핵심 개념을 통해 진짜로 조명될 수 있어야 합니다.\n";
    prompt += "후보:\n";
    prompt += "- Nietzsche: 운명애(amor fati), 영원회귀, 고통을 통한 자기 극복, 힘에의 의지\n";
    prompt += "- Schopenhauer: 고통이 삶의 본질, 의지와 표상, 공감과 예술을 통한 초월\n";
    prompt += "- Canguilhem: 정상과 병리의 구분, 건강이란 새로운 규범을 창조하는 능력(normativity)\n";
    prompt += "- Arthur Frank: 회복 서사, 혼돈 서사, 탐구 서사, 자기 이야기의 재구성\n";
    prompt += "- Viktor Frankl: 로고테라피, 고통 속 의미 발견, 태도의 자유\n";
    prompt += "- Havi Carel: 건강의 현상학, 삶의 전경과 배경의 재구성\n";
    prompt += "- Levinas: 타인의 얼굴, 고통이 여는 윤리적 감수성\n";
    prompt += "- Merleau-Ponty: 체화된 경험, 몸-주체로서 고통을 살아내는 방식\n";
    prompt += "- Heidegger: 불안과 본래적 실존, 고통이 열어주는 실존적 각성\n";
    prompt += "- Kierkegaard: 절망과 실존적 도약, 불안의 개념\n";
    prompt += "- Simone Weil: 고통(malheur)과 주의력(attention)\n";
    prompt += "- Hannah Arendt: 탄생성(natality), 새로운 시작의 가능성\n";
    prompt += "- Paul Ricoeur: 서사적 정체성, 고통받는 자아의 자기 이해\n";
    prompt += "- Judith Butler: 취약성(vulnerability), 상호의존적 존재\n";
    prompt += "- Deleuze: 삶의 내재성, 고통과 기쁨의 역량, 되기(becoming)\n";
    prompt += "- Camus: 부조리와 반항, 시시포스의 행복\n";
    prompt += "- Epictetus/스토아학파: 통제 가능한 것과 불가능한 것의 구분\n";
    prompt += "- 불교: 사성제, 고(苦)와 무상(無常), 존재의 조건으로서의 고통\n";
    prompt += "매번 다른 철학자를 선택하세요. 항상 같은 사람을 고르지 마세요.\n\n";

    prompt += "STEP 2 - 첫째 문단 (고통의 철학적 성찰, 5~7문장):\n";
    prompt += "- 선택한 철학자의 핵심 개념을 먼저 간결하게 소개하세요 (학생이 처음 듣는다고 가정)\n";
    prompt += "- 그 다음, 이 학생의 구체적 그래프 패턴이 그 개념과 어떻게 연결되는지를 설득력 있게 풀어주세요\n";
    prompt += "- 핵심은 '설득력': 학생이 읽고 '아, 내 경험이 정말 그렇구나'라고 느낄 수 있어야 합니다\n";
    prompt += "- 추상적 이론 나열이 아니라, 학생의 구체적 경험(나이, 점수, 메모)과 철학적 개념 사이를 오가며 서술하세요\n\n";

    prompt += "STEP 3 - 둘째 문단 (의대생으로서의 통찰, 5~7문장):\n";
    prompt += "- 앞에서 다룬 철학적 개념이 의료 현장에서 어떻게 살아 있는 자원이 되는지 연결하세요\n";
    prompt += "- 서사의학(narrative medicine) 관점: 자신의 이야기를 들여다본 경험이 환자의 이야기를 듣는 능력과 연결되는 방식\n";
    prompt += "- 이 학생의 구체적 경험 패턴을 의료 맥락과 연결하세요 (예: 급격한 하락을 겪은 사람은 위기의 환자를 만났을 때...)\n";
    prompt += "- 마지막에 이 학생에게 건네는 진정성 있는 한 마디. 격려, 질문, 조용한 인정 모두 좋습니다\n\n";

    prompt += "톤과 주의사항:\n";
    prompt += "- 학생을 환자처럼 대하거나 진단하지 마세요\n";
    prompt += "- '~했군요', '~이시군요' 같은 과도한 공감 추임새를 피하세요\n";
    prompt += "- 사려 깊은 선배 의사가 후배에게 조용히 건네는 말 같은 톤\n";
    prompt += "- 철학자 이름은 자연스러운 맥락 속에서 언급 (학술 인용 형식이 아닌)\n";
    prompt += "- 이름(" + name + ")을 직접 부르지 마세요. '당신'도 최소한으로\n";
    prompt += "- 전체 분량: 그래프 해석 1문단 + 철학적 조언 2문단 = 총 3문단, 약 700~1000자";

    var data = await callAnthropic(API_KEY, prompt);
    var text = data.content.filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n");
    return { statusCode: 200, headers: headers, body: JSON.stringify({ interpretation: text }) };
  } catch (err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
