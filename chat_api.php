<?php
// chat_api.php - Aux AI backend (Step 3)
// Receives: {"message": "user question"}
// Returns:  {"reply": "...", "source": "..."}

header("Content-Type: application/json; charset=utf-8");

// Only accept POST requests
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["reply" => "Please send your question using the chat window.", "source" => "system"]);
    exit;
}

// Read the JSON sent by aux-chatbot.js
$input = json_decode(file_get_contents("php://input"), true);
$message = isset($input["message"]) ? trim($input["message"]) : "";

if ($message === "") {
    echo json_encode(["reply" => "Please type a question.", "source" => "system"]);
    exit;
}

// Keep messages a sensible length
if (mb_strlen($message) > 500) {
    $message = mb_substr($message, 0, 500);
}

// ---------------------------------------------------
// Step 5 + 6: search the FAQ table, reply in the user's language
// ---------------------------------------------------
require_once "db_connect.php";

$userText = mb_strtolower($message, "UTF-8");

// Step 6: if the message has Hindi (Devanagari) letters, reply in Hindi
$isHindi = preg_match('/\p{Devanagari}/u', $message) === 1;

$result = $conn->query("SELECT id, keywords, answer_en, answer_hi FROM faq_entries WHERE status = 1");

$bestRow = null;
$bestScore = 0;

while ($row = $result->fetch_assoc()) {
    $score = 0;
    $keywords = explode(",", $row["keywords"]);

    foreach ($keywords as $kw) {
        $kw = trim(mb_strtolower($kw, "UTF-8"));
        if ($kw !== "" && mb_strpos($userText, $kw) !== false) {
            $score++;
        }
    }

    if ($score > $bestScore) {
        $bestScore = $score;
        $bestRow = $row;
    }
}

// ---------------------------------------------------
// Step 7: if the FAQ has no answer, ask Gemini
// ---------------------------------------------------
require_once "config.php";

$useGemini = true;
$setRes = $conn->query("SELECT setting_value FROM chatbot_settings WHERE setting_key = 'use_gemini'");
if ($setRes && $setRow = $setRes->fetch_assoc()) {
    $useGemini = ($setRow["setting_value"] === "1");
}

function askGemini($question, $isHindi, $apiKey, $model) {
    $url = "https://generativelanguage.googleapis.com/v1beta/models/" . $model . ":generateContent";

    $langRule = $isHindi ? "Reply in Hindi." : "Reply in English.";
    $systemText = "You are Aux AI, a helpful assistant on a college website. "
        . "Answer briefly, in at most 3 or 4 sentences. " . $langRule . " "
        . "If you are not sure about college-specific details such as fees, dates or phone numbers, "
        . "say you are not sure and suggest contacting the college office. "
        . "Never ask the user for personal information.";

    $body = json_encode([
        "systemInstruction" => ["parts" => [["text" => $systemText]]],
        "contents" => [["parts" => [["text" => $question]]]],
        "generationConfig" => ["maxOutputTokens" => 1500]
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "Content-Type: application/json",
            "x-goog-api-key: " . $apiKey
        ],
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_SSL_VERIFYPEER => false
    ]);

    $response = curl_exec($ch);
    curl_close($ch);
    if ($response === false) return null;

    $data = json_decode($response, true);
    if (!isset($data["candidates"][0]["content"]["parts"])) return null;

    $text = "";
    foreach ($data["candidates"][0]["content"]["parts"] as $part) {
        if (isset($part["text"])) $text .= $part["text"];
    }
    $text = trim($text);
    return $text !== "" ? $text : null;
}

if ($bestRow !== null) {
    // Answer found in our own FAQ table
    $reply = $isHindi ? $bestRow["answer_hi"] : $bestRow["answer_en"];
    $source = "faq";
} else {
    $geminiAnswer = $useGemini ? askGemini($message, $isHindi, $GEMINI_API_KEY, $GEMINI_MODEL) : null;

    if ($geminiAnswer !== null) {
        $label = $isHindi ? "(यह उत्तर Gemini से है)" : "(This answer is from Gemini)";
        $reply = $geminiAnswer . "\n\n" . $label;
        $source = "gemini";
    } else {
        $reply = $isHindi
            ? "क्षमा करें, इस बारे में अभी मेरे पास जानकारी नहीं है।"
            : "Sorry, I don't have information about that yet.";
        $source = "none";
    }
}

echo json_encode(["reply" => $reply, "source" => $source], JSON_UNESCAPED_UNICODE);