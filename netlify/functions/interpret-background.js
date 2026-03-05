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
          if (res.statusCode !== 200) reject(new Error("API " + res.statusCode));
          else resolve(parsed);
        } catch (e) { reject(new Error("Parse error")); }
      });
    });
    req.on("error", function (e) { reject(e); });
    req.write(body);
    req.end();
  });
}

function firebasePut(url, data) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify(data);
    var parsed = new URL(url);
    var options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "PUT",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };
    var req = https.request(options, function (res) {
      var d = "";
      res.on("data", function (chunk) { d += chunk; });
      res.on("end", function () { resolve(d); });
    });
    req.on("error", function (e) { reject(e); });
    req.write(body);
    req.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  var API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return { statusCode: 500, body: "No API key" };

  var input;
  try {
    input = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  var prompt = input.prompt;
  var firebaseUrl = input.firebaseUrl;
  var fbKey = input.fbKey;

  try {
    var data = await callAnthropic(API_KEY, prompt);
    var text = data.content.filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n");

    if (firebaseUrl && fbKey) {
      await firebasePut(firebaseUrl + "/submissions/" + fbKey + "/aiInterpretation.json", text);
    }
  } catch (err) {
    if (firebaseUrl && fbKey) {
      try {
        await firebasePut(firebaseUrl + "/submissions/" + fbKey + "/aiError.json", err.message);
      } catch (e) {}
    }
  }

  return { statusCode: 200, body: "ok" };
};
