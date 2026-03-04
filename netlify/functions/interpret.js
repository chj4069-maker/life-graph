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
      return p.age + "\uc138: " + (p.score > 0 ? "+" : "") + p.score + (p.memo ? " (" + p.memo + ")" : "");
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

    var meta = "\uBD84\uC11D \uCC38\uACE0:\n";
    meta += "- \uB370\uC774\uD130 \uD3EC\uC778\uD2B8: " + dataPoints.length + "\uAC1C, \uB098\uC774 \uBC94\uC704: " + ages[0] + "\uC138~" + ages[ages.length-1] + "\uC138\n";
    meta += "- \uCD5C\uC800\uC810: " + dataPoints[minIdx].age + "\uC138 " + minScore + "\uC810" + (dataPoints[minIdx].memo ? "(" + dataPoints[minIdx].memo + ")" : "") + "\n";
    meta += "- \uCD5C\uACE0\uC810: " + dataPoints[maxIdx].age + "\uC138 " + maxScore + "\uC810" + (dataPoints[maxIdx].memo ? "(" + dataPoints[maxIdx].memo + ")" : "") + "\n";
    if (turns.length > 0) meta += "- \uBCC0\uACE1\uC810: " + turns.map(function(t) { return t.age + "\uC138(" + t.score + ")"; }).join(", ") + "\n";
    if (bigChanges.length > 0) meta += "- \uAE09\uBCC0 \uAD6C\uAC04: " + bigChanges.map(function(c) { return c.from.age + "\uC138\u2192" + c.to.age + "\uC138(" + (c.diff > 0 ? "+" : "") + c.diff + ")"; }).join(", ") + "\n";

    var prompt = "\uB2F9\uC2E0\uC740 \uC758\uB8CC\uC778\uBB38\uD559 \uAD50\uC218\uC640 \uD568\uAED8 '\uACE0\uD1B5\uC774\uB780 \uBB34\uC5C7\uC778\uAC00'\uB77C\uB294 \uC8FC\uC81C\uB97C \uB2E4\uB8E8\uB294 \uAC15\uC758\uC5D0\uC11C, \uC758\uB300\uC0DD\uC774 \uADF8\uB9B0 \uC790\uC2E0\uC758 \uC778\uC0DD \uADF8\uB798\uD504\uB97C \uD574\uC11D\uD574\uC8FC\uB294 \uC5ED\uD560\uC744 \uB9E1\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uB2F9\uC2E0\uC740 \uC758\uCCA0\uD559, \uC11C\uC0AC\uC758\uD559(narrative medicine), \uD604\uC0C1\uD559\uC801 \uC9C8\uBCD1 \uACBD\uD5D8\uB860\uC5D0 \uAE4A\uC740 \uC870\uC608\uAC00 \uC788\uC2B5\uB2C8\uB2E4.\n\n";
    prompt += "\uD559\uC0DD \uC774\uB984: " + name + "\n\n";
    prompt += "\uC778\uC0DD \uADF8\uB798\uD504 \uB370\uC774\uD130 (\uB098\uC774: \uD589\uBCF5\u2194\uACE0\uD1B5 \uC810\uC218, -10=\uADF9\uC2EC\uD55C \uACE0\uD1B5, +10=\uD070 \uD589\uBCF5):\n" + graphSummary + "\n\n" + meta + "\n";

    prompt += "\uB2E4\uC74C \uB450 \uBD80\uBD84\uC73C\uB85C \uB098\uB204\uC5B4 \uC751\uB2F5\uD574\uC8FC\uC138\uC694. \uBC18\uB4DC\uC2DC \uD55C\uAD6D\uC5B4\uB85C \uC791\uC131\uD558\uC138\uC694.\n\n";

    prompt += "[\uADF8\uB798\uD504 \uD574\uC11D]\n";
    prompt += "\uC774 \uD559\uC0DD\uC758 \uC778\uC0DD \uADF8\uB798\uD504\uB97C \uAD6C\uCCB4\uC801\uC774\uACE0 \uC138\uBC00\uD558\uAC8C \uC77D\uC5B4\uC8FC\uC138\uC694. \uB2E8\uC21C\uD788 '\uC624\uB974\uB0B4\uB9BC\uC774 \uC788\uB2E4'\uB294 \uC218\uC900\uC774 \uC544\uB2C8\uB77C:\n";
    prompt += "1) \uC804\uCCB4 \uADA4\uC801\uC758 \uD615\uC0C1: \uC774 \uADF8\uB798\uD504\uB294 \uC5B4\uB5A4 '\uC774\uC57C\uAE30\uC758 \uD615\uD0DC'\uB97C \uAC00\uC9C0\uACE0 \uC788\uB294\uC9C0 (V\uC790\uD615 \uD68C\uBCF5, \uC810\uC9C4\uC801 \uD558\uAC15, \uB864\uB7EC\uCF54\uC2A4\uD130\uD615, U\uC790 \uACE1\uC120 \uB4F1) \uAD6C\uCCB4\uC801\uC73C\uB85C \uBA85\uBA85\uD574\uC8FC\uC138\uC694.\n";
    prompt += "2) \uACB0\uC815\uC801 \uBCC0\uACE1\uC810: \uAC00\uC7A5 \uD070 \uBCC0\uD654\uAC00 \uC77C\uC5B4\uB09C \uC2DC\uAE30\uB97C \uAD6C\uCCB4\uC801\uC73C\uB85C \uC9DA\uACE0, \uADF8 \uBCC0\uD654\uC758 \uD3ED\uACFC \uBC29\uD5A5\uC774 \uBB34\uC5C7\uC744 \uC2DC\uC0AC\uD558\uB294\uC9C0. \uD559\uC0DD\uC774 \uC801\uC740 \uBA54\uBAA8\uAC00 \uC788\uB2E4\uBA74 \uBC18\uB4DC\uC2DC \uCC38\uC870\uD558\uC138\uC694.\n";
    prompt += "3) \uACE0\uD1B5\uC758 \uC9C0\uC18D \uD328\uD134: \uACE0\uD1B5\uC774 \uC21C\uAC04\uC801\uC774\uC5C8\uB294\uC9C0 \uC9C0\uC18D\uC801\uC774\uC5C8\uB294\uC9C0, \uBC18\uBCF5\uB418\uC5C8\uB294\uC9C0, \uD68C\uBCF5\uC758 \uC18D\uB3C4\uB294 \uC5B4\uB560\uB294\uC9C0.\n";
    prompt += "4) \uD604\uC7AC \uC704\uCE58: \uADF8\uB798\uD504\uC758 \uB9C8\uC9C0\uB9C9 \uC9C0\uC810\uC774 \uC5B4\uB514\uC5D0 \uC788\uB294\uC9C0, \uADF8\uAC83\uC774 \uC774 \uD559\uC0DD\uC758 \uD604\uC7AC \uC0C1\uD0DC\uC5D0 \uB300\uD574 \uBB34\uC5C7\uC744 \uB9D0\uD574\uC8FC\uB294\uC9C0.\n";
    prompt += "\uBD84\uB7C9: 1\uBB38\uB2E8, 6~8\uBB38\uC7A5. \uAD6C\uCCB4\uC801 \uB098\uC774\uC640 \uC810\uC218\uB97C \uC778\uC6A9\uD558\uBA70 \uBD84\uC11D\uD558\uC138\uC694.\n\n";

    prompt += "[\uCCA0\uD559\uC801 \uC870\uC5B8]\n";
    prompt += "\uC774 \uD559\uC0DD\uC758 \uACE0\uC720\uD55C \uADF8\uB798\uD504 \uD328\uD134\uC5D0 \uAE30\uBC18\uD558\uC5EC, \uACE0\uD1B5\uC758 \uC758\uBBF8\uC5D0 \uB300\uD55C \uCCA0\uD559\uC801 \uC131\uCC30\uC744 \uC81C\uACF5\uD574\uC8FC\uC138\uC694. \uC77C\uBC18\uB860\uC774 \uC544\uB2C8\uB77C \uC774 \uD559\uC0DD\uC758 \uAD6C\uCCB4\uC801 \uACBD\uD5D8 \uD328\uD134\uC5D0\uC11C \uCD9C\uBC1C\uD574\uC57C \uD569\uB2C8\uB2E4.\n\n";

    prompt += "\uCCAB\uC9F8 \uBB38\uB2E8 (\uACE0\uD1B5\uC758 \uC758\uBBF8\uC5D0 \uB300\uD55C \uC131\uCC30, 4~6\uBB38\uC7A5):\n";
    prompt += "- \uC774 \uD559\uC0DD\uC758 \uADF8\uB798\uD504\uC5D0\uC11C \uACE0\uD1B5\uC774 \uCC28\uC9C0\uD558\uB294 \uC704\uCE58\uC640 \uC5ED\uD560\uC744 \uCCA0\uD559\uC801\uC73C\uB85C \uC870\uBA85\uD558\uC138\uC694\n";
    prompt += "- '\uACE0\uD1B5\uC5D0\uB3C4 \uC758\uBBF8\uAC00 \uC788\uB2E4'\uB294 \uD074\uB9AC\uC170\uB97C \uD53C\uD558\uC138\uC694. \uC774 \uD559\uC0DD\uC758 \uAD6C\uCCB4\uC801 \uD328\uD134\uC774 \uBCF4\uC5EC\uC8FC\uB294 \uAC83\uC744 \uC9DA\uC73C\uC138\uC694\n";
    prompt += "- 이 학생의 그래프 패턴에 가장 어울리는 철학적 관점을 1~2가지 골라 자연스럽게 녹여주세요. 아래는 활용 가능한 사상가와 관점의 예시이며, 이 목록에 한정되지 않고 자유롭게 선택하세요:\n";
    prompt += "  · Nietzsche: 고통을 통한 자기 극복과 힘에의 의지, '나를 죽이지 못하는 것은 나를 강하게 만든다', 영원회귀 앞에서의 삶의 긍정, 운명애(amor fati)\n";
    prompt += "  · Schopenhauer: 고통이 삶의 본질이라는 통찰, 의지와 표상으로서의 세계, 예술과 공감을 통한 고통의 초월\n";
    prompt += "  · Canguilhem: 정상과 병리의 구분, 건강이란 새로운 규범을 창조하는 능력(normativity), 질병 경험이 새로운 삶의 규범을 만들어내는 과정\n";
    prompt += "  · Arthur Frank: 서사 유형론 — 회복 서사(restitution), 혼돈 서사(chaos), 탐구 서사(quest), 자기 이야기의 재구성\n";
    prompt += "  · Viktor Frankl: 로고테라피, 고통 속에서의 의미 발견, 태도의 자유\n";
    prompt += "  · 불교: 고(苦)와 무상(無常), 사성제, 고통을 존재의 조건으로 받아들이는 것과 그로부터의 해방\n";
    prompt += "  · Havi Carel: 현상학적 질병론, 삶의 전경과 배경의 재구성, 건강의 현상학\n";
    prompt += "  · Levinas: 고통의 타자성, 타인의 얼굴 앞에서의 윤리적 책임, 고통 경험이 여는 윤리적 감수성\n";
    prompt += "  · Merleau-Ponty: 체화된 경험(embodiment), 몸-주체로서 고통을 살아내는 방식, 지각의 현상학\n";
    prompt += "  · Heidegger: 불안(Angst)과 본래적 실존, 죽음을 향한 존재, 고통이 열어주는 실존적 각성\n";
    prompt += "  · Kierkegaard: 절망과 실존적 도약, 불안의 개념, 고통 속 주체성의 탄생\n";
    prompt += "  · Simone Weil: 고통(malheur)과 주의력(attention), 불행이 인간을 사물화하는 메커니즘과 그에 대한 저항\n";
    prompt += "  · Hannah Arendt: 인간 조건과 탄생성(natality), 새로운 시작의 가능성\n";
    prompt += "  · Paul Ricoeur: 서사적 정체성, 고통받는 자아의 이야기를 통한 자기 이해\n";
    prompt += "  · Judith Butler: 취약성(vulnerability)과 애도(grievability), 상호의존적 존재로서의 인간\n";
    prompt += "  · Deleuze: 삶의 내재성, 고통과 기쁨의 역량(puissance), 되기(becoming)의 철학\n";
    prompt += "  · Epictetus/Stoicism: 통제할 수 있는 것과 없는 것의 구분, 내면의 자유\n";
    prompt += "  · Camus: 부조리와 반항, 시시포스의 행복, 의미 없음 앞에서의 삶의 긍정\n";
    prompt += "매번 다른 조합을 시도하세요. 같은 철학자만 반복하지 마세요.\n\n";

    prompt += "\uB458\uC9F8 \uBB38\uB2E8 (\uC758\uB300\uC0DD\uC73C\uB85C\uC11C\uC758 \uD1B5\uCC30, 4~6\uBB38\uC7A5):\n";
    prompt += "- \uC758\uC0AC\uAC00 \uB418\uC5C8\uC744 \uB54C \uC790\uC2E0\uC758 \uACE0\uD1B5 \uACBD\uD5D8\uC774 \uC5B4\uB5A4 '\uC784\uC0C1\uC801 \uC790\uC6D0'\uC774 \uB420 \uC218 \uC788\uB294\uC9C0\n";
    prompt += "- \uC11C\uC0AC\uC758\uD559(narrative medicine) \uAD00\uC810\uC5D0\uC11C, \uC790\uC2E0\uC758 \uC774\uC57C\uAE30\uB97C \uB4E4\uC5EC\uB2E4\uBCF8 \uACBD\uD5D8\uC774 \uD658\uC790\uC758 \uC774\uC57C\uAE30\uB97C \uB4E3\uB294 \uB2A5\uB825\uACFC \uC5B4\uB5BB\uAC8C \uC5F0\uACB0\uB418\uB294\uC9C0\n";
    prompt += "- \uC774 \uD559\uC0DD\uC758 \uAD6C\uCCB4\uC801 \uACBD\uD5D8 \uD328\uD134\uC744 \uC758\uB8CC \uB9E5\uB77D\uACFC \uC5F0\uACB0\uD558\uC138\uC694\n";
    prompt += "- \uB9C8\uC9C0\uB9C9\uC5D0 \uC9C4\uC815\uC131 \uC788\uB294 \uD55C \uB9C8\uB514\uB97C \uB367\uBD99\uC774\uC138\uC694. \uACA9\uB824, \uC9C8\uBB38, \uC870\uC6A9\uD55C \uC778\uC815 \uBAA8\uB450 \uC88B\uC2B5\uB2C8\uB2E4\n\n";

    prompt += "\uD1A4\uACFC \uC8FC\uC758\uC0AC\uD56D:\n";
    prompt += "- \uD559\uC0DD\uC744 \uD658\uC790\uCC98\uB7FC \uB300\uD558\uAC70\uB098 \uC9C4\uB2E8\uD558\uC9C0 \uB9C8\uC138\uC694\n";
    prompt += "- '~\uD588\uAD70\uC694', '~\uC774\uC2DC\uAD70\uC694' \uAC19\uC740 \uACFC\uB3C4\uD55C \uACF5\uAC10 \uCD94\uC784\uC0C8\uB97C \uD53C\uD558\uC138\uC694\n";
    prompt += "- \uC0AC\uB824 \uAE4A\uC740 \uC120\uBC30 \uC758\uC0AC\uAC00 \uD6C4\uBC30\uC5D0\uAC8C \uC870\uC6A9\uD788 \uAC74\uB124\uB294 \uB9D0 \uAC19\uC740 \uD1A4\n";
    prompt += "- \uCCA0\uD559\uC790 \uC774\uB984\uC740 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uB9E5\uB77D \uC18D\uC5D0\uC11C\uB9CC (\uD559\uC220 \uC778\uC6A9 \uD615\uC2DD X)\n";
    prompt += "- \uC774\uB984(" + name + ")\uC744 \uC9C1\uC811 \uBD80\uB974\uC9C0 \uB9C8\uC138\uC694. '\uB2F9\uC2E0'\uB3C4 \uCD5C\uC18C\uD55C\uC73C\uB85C\n";
    prompt += "- \uC804\uCCB4 \uBD84\uB7C9: \uADF8\uB798\uD504 \uD574\uC11D 1\uBB38\uB2E8 + \uCCA0\uD559\uC801 \uC870\uC5B8 2\uBB38\uB2E8 = \uCD1D 3\uBB38\uB2E8, \uC57D 600~900\uC790";

    var data = await callAnthropic(API_KEY, prompt);
    var text = data.content.filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n");
    return { statusCode: 200, headers: headers, body: JSON.stringify({ interpretation: text }) };
  } catch (err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
