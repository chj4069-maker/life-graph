const https = require("https");

function callAnthropic(apiKey, prompt) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
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
          if (res.statusCode !== 200) {
            reject(new Error("API " + res.statusCode + ": " + data));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error("Parse error: " + data.substring(0, 200)));
        }
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
  if (!API_KEY) return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set in environment variables" }) };

  try {
    var input = JSON.parse(event.body);
    var name = input.name;
    var dataPoints = input.dataPoints;

    var graphSummary = dataPoints.map(function (p) {
      return p.age + "세: " + (p.score > 0 ? "+" : "") + p.score + (p.memo ? " (" + p.memo + ")" : "");
    }).join("\n");

    var prompt = "당신은 의료인문학 강의에서 '고통이란 무엇인가'라는 주제를 다루는 맥락에서, 학생이 그린 자신의 인생 그래프를 해석해주는 역할입니다.\n\n학생 이름: " + name + "\n인생 그래프 데이터 (나이: 행복↔고통 점수, -10=극심한 고통, +10=큰 행복):\n" + graphSummary + "\n\n다음 두 부분으로 나누어 응답해주세요. 반드시 한국어로, 따뜻하고 사려 깊은 톤으로 작성하세요.\n\n[그래프 해석]\n- 그래프의 전반적 흐름과 패턴을 읽어주세요 (어떤 시기에 큰 변화가 있었는지, 전반적 궤적이 어떤 모양인지)\n- 학생의 고통과 행복이 어떤 리듬을 가지고 있는지 짚어주세요\n- 3~4문장 정도로 간결하게\n\n[철학적 조언]\n- 학생의 그래프에서 읽히는 고통의 경험에 공감하면서, 고통이 삶에서 어떤 의미를 가질 수 있는지 철학적 통찰을 제공하세요\n- Arthur Frank의 서사적 관점, Viktor Frankl의 의미 찾기, 또는 동양 철학(불교의 고/苦 개념) 등을 자연스럽게 참조할 수 있지만, 학술적이지 않고 개인적이고 따뜻한 어조로 써주세요\n- 고통을 단순히 극복해야 할 대상으로 보지 말고, 그것이 이 학생의 삶에서 어떤 역할을 했을 수 있는지 사려 깊게 이야기해주세요\n- 의대생으로서 앞으로 환자의 고통을 만나게 될 때, 자신의 고통 경험이 어떤 자원이 될 수 있는지 한 마디 덧붙여주세요\n- 4~5문장 정도\n\n주의사항:\n- 진단이나 심리상담을 하지 마세요\n- '~했군요', '~이시군요' 같은 과도한 공감 표현을 남발하지 마세요\n- 진정성 있고 사려 깊되, 격식 있는 톤을 유지하세요\n- 전체 길이는 적당히 (총 250~400자 내외)";

    var data = await callAnthropic(API_KEY, prompt);
    var text = data.content.filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n");

    return { statusCode: 200, headers: headers, body: JSON.stringify({ interpretation: text }) };
  } catch (err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
