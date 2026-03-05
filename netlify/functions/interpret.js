const https = require("https");

function callAnthropic(apiKey, prompt) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    var options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      timeout: 25000,
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
          if (res.statusCode !== 200) reject(new Error("API " + res.statusCode + ": " + data.substring(0, 300)));
          else resolve(parsed);
        } catch (e) { reject(new Error("Parse error: " + data.substring(0, 200))); }
      });
    });
    req.setTimeout(25000, function() { req.destroy(); reject(new Error("Request timeout")); });
    req.on("error", function (e) { reject(e); });
    req.write(body);
    req.end();
  });
}

exports.handler = async function (event, context) {
  // Netlify 함수 타임아웃 최대로
  if (context) context.callbackWaitsForEmptyEventLoop = false;

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
    var dp = input.dataPoints;

    var summary = dp.map(function (p) {
      return p.age + "세: " + (p.score > 0 ? "+" : "") + p.score + (p.memo ? " (" + p.memo + ")" : "");
    }).join("\n");

    var scores = dp.map(function(p) { return p.score; });
    var minS = Math.min.apply(null, scores);
    var maxS = Math.max.apply(null, scores);
    var minI = scores.indexOf(minS);
    var maxI = scores.indexOf(maxS);

    var prompt = "의료인문학 강의('고통이란 무엇인가')에서 의대생의 인생 그래프를 해석하세요.\n\n";
    prompt += "학생: " + name + "\n데이터(-10=극심한 고통, +10=큰 행복):\n" + summary + "\n";
    prompt += "최저: " + dp[minI].age + "세 " + minS + "점, 최고: " + dp[maxI].age + "세 " + maxS + "점\n\n";

    prompt += "핵심원칙: 개별성이 가장 중요합니다. 학생이 적은 구체적 순간들(나이, 점수, 메모)을 직접 언급하고, 순간들 사이의 관계와 흐름을 읽으세요. '나를 정확히 읽어냈다'고 느끼게.\n\n";

    prompt += "[그래프 해석] (1문단, 5~7문장)\n";
    prompt += "궤적의 형상(V자형/U자형/롤러코스터 등)을 명명하고, 메모가 있는 순간을 구체적으로 언급하세요. 극단적 점수(-7이하)는 무게를 두어 다루세요. 마지막 지점이 '지금'에 대해 말하는 것을 짚으세요.\n\n";

    prompt += "[철학적 조언] (3문단)\n\n";
    prompt += "1문단 - 순간들의 대화(5~6문장): 기록된 순간들을 비교/연결하세요. 행복과 고통의 관계. 극단적 순간에 진정성 있게 공감. 철학자 한 명의 개념을 렌즈로 1~2문장만 빌려오세요(이론설명X, 경험에 비추는 용도만).\n";
    prompt += "철학자 풀(하나만): Nietzsche(운명애), Schopenhauer(고통의 본질), Canguilhem(새 규범창조), Frank(서사유형), Frankl(의미발견), Carel(건강현상학), Levinas(타자의고통), Merleau-Ponty(체화경험), Heidegger(실존각성), Kierkegaard(절망과 도약), Simone Weil(주의력), Arendt(새 시작), Ricoeur(서사정체성), Butler(취약성), Deleuze(되기), Camus(부조리), 스토아학파, 불교(고와 무상). 매번 다른 철학자 선택.\n\n";

    prompt += "2문단 - 고통 이후의 변화(4~5문장): 고통 이후 그래프에서 실제로 무엇이 달라졌는지(또는 안 달라졌는지). 추상적 '고통에 의미가 있다' 금지. 이 학생 그래프에서 보이는 것만.\n\n";

    prompt += "3문단 - 의료인으로서(4~5문장): '환자에게 공감하세요' 같은 교과서적 말 금지. 이 학생의 구체적 경험과 의료 상황을 연결. 마지막에 이 학생에게만 건네는 진부하지 않은 한마디.\n\n";

    prompt += "톤: 진단/상담 금지. '~했군요' 금지. 선배가 조용히 건네는 말. 이름 부르지 마세요. 한국어. 총 4문단, 700~1000자.";

    var data = await callAnthropic(API_KEY, prompt);
    var text = data.content.filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n");
    return { statusCode: 200, headers: headers, body: JSON.stringify({ interpretation: text }) };
  } catch (err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
