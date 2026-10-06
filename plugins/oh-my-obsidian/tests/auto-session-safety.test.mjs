import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeAutoContent } from "../scripts/auto-session-safety.mjs";

const unsafe = [
  "API_KEY=sk-test-not-a-real-secret-1234567890",
  '"client_secret": "synthetic-secret-only"',
  "password=synthetic-test-password",
  "비밀번호: synthetic-test-password",
  "aws_secret_access_key=synthetic-test-secret",
  "복구구문: synthetic recovery phrase for testing",
  "seed_phrase=synthetic recovery phrase for testing",
  "-----BEGIN OPENSSH PRIVATE KEY-----",
  `0x${"a".repeat(64)}`,
  `ghp_${"a".repeat(36)}`,
  `eyJ${"a".repeat(12)}.${"b".repeat(16)}.${"c".repeat(16)}`,
  "Authorization: Bearer synthetic-token-only",
  "Cookie: session=synthetic-test-value",
  "postgresql://test-user:synthetic-password@localhost/test",
  "test-person@synthetic.invalid",
  "010-0000-0000",
  "000000-1000000",
  "사용자: 원문 메시지\n어시스턴트: 원문 답변",
  '{"role":"user","content":"raw conversation"}',
  '<hook_prompt>raw internal prompt</hook_prompt>',
  '{"type":"event_msg","payload":{"content":"raw log"}}',
  "ＡＰＩ＿ＫＥＹ＝synthetic-secret-only",
  "API_\u200bKEY=synthetic-secret-only",
  "API_\u202eKEY=synthetic-secret-only",
];

test("automatic safety rejects synthetic credentials, common personal identifiers and raw artifacts without echoing values", () => {
  for (const value of unsafe) {
    assert.throws(() => assertSafeAutoContent([value]), (error) => {
      assert.match(error.message, /automatic save refused/);
      assert.equal(error.message.includes(value), false);
      return true;
    });
  }
});

test("sanitized work summaries, explicit redactions and machine identifiers remain usable", () => {
  assert.doesNotThrow(() => assertSafeAutoContent([
    "자동 저장 검사와 회귀 테스트를 구현했다. API_KEY 값은 기록하지 않는다.",
    "API_KEY=[REDACTED_SECRET]", "password=***", "client_secret=${CLIENT_SECRET}",
    "refresh_token=<redacted>", "autoSave:false", "session-recover를 검증한다.",
    "<!-- oh-my-obsidian:auto-session:abcd0000001000000efgh -->",
  ]));
});

test("oversized summaries are rejected before pattern scanning", () => {
  assert.throws(() => assertSafeAutoContent(["a".repeat(65537)]), /scan limit/);
});
