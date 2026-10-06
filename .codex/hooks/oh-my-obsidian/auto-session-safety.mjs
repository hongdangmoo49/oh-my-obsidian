const REDACTED = /^(?:\[REDACTED(?:_SECRET)?\]|<redacted>|<placeholder>|<token>|\*{3,}|\$\{[A-Z0-9_]+\}|\$[A-Z0-9_]+)$/i;
const PATTERNS = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/i],
  ["credential-token", /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,512}|gh[pousr]_[A-Za-z0-9]{16,255}|github_pat_[A-Za-z0-9_]{20,255}|AKIA[0-9A-Z]{16})\b/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,2048}\.[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,1024}\b/],
  ["authorization", /\b(?:Authorization|Proxy-Authorization)\s*:\s*(?:Bearer|Basic)\s+[^\s]+/i],
  ["session-cookie", /^\s*(?:Cookie|Set-Cookie)\s*:\s*\S+/im],
  ["credential-url", /\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]*:[^\s@/]+@/i],
  ["private-key-like-hex", /\b0x[a-f0-9]{64}\b/i],
  ["email", /\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,253}\.[A-Z]{2,24}\b/i],
  ["phone", /(?:^|[^\da-z])(?:\+82[- .]?)?01[016789][- .]?\d{3,4}[- .]?\d{4}(?![\da-z])/i],
  ["personal-id", /(?:^|[^\da-z])\d{6}[- ]?[1-8]\d{6}(?![\da-z])/i],
  ["raw-conversation", /^(?:\s*>\s*)?(?:user|assistant|system|developer|사용자|어시스턴트|시스템|raw transcript|conversation transcript|대화 원문|원문 대화)\s*[:：]/im],
  ["raw-conversation", /"role"\s*:\s*"(?:user|assistant|system|developer)"/i],
  ["raw-tool-output", /<\/?(?:hook_prompt|tool_output|tool_result)\b|"type"\s*:\s*"(?:response_item|event_msg|turn_context)"/i],
];

// ponytail: bounded heuristics, not exhaustive DLP; unlabeled names and encoded secrets can evade detection.
export function assertSafeAutoContent(values) {
  const texts = values.map((value) => String(value || ""));
  if (texts.reduce((total, text) => total + Buffer.byteLength(text, "utf8"), 0) > 65536) {
    throw new Error("automatic save refused: content exceeds the safety scan limit");
  }
  for (const raw of texts) {
    const text = raw.normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "");
    for (const [category, pattern] of PATTERNS) {
      if (pattern.test(text)) throw new Error(`automatic save refused: suspected ${category}; supply a sanitized summary`);
    }
    const assignments = /(?:\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|seed[_-]?phrase|mnemonic|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key)\b|비밀번호|개인키|시드구문|복구구문|니모닉|전화번호|연락처|주민등록번호|집주소|거주지)["']?\s*[:=]\s*["']?([^\s"'`,;]{1,512})/gi;
    for (const match of text.matchAll(assignments)) {
      if (!REDACTED.test(match[1])) throw new Error("automatic save refused: suspected sensitive assignment; supply a sanitized summary");
    }
  }
}
