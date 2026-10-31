const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const INVITE_CODE_LENGTH = 24;

// firestore.rules의 코드 형식 검사('[A-Za-z0-9]{24}')와 같아야 한다.
const INVITE_CODE_PATTERN = new RegExp(`^[A-Za-z0-9]{${INVITE_CODE_LENGTH}}$`);

export function isValidInviteCode(code: string): boolean {
  return INVITE_CODE_PATTERN.test(code);
}

type RandomBytes = (length: number) => Uint8Array;

function browserRandomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/**
 * 추측할 수 없는 초대 코드를 만든다. (영숫자 62종 × 24자)
 * 62는 256의 약수가 아니므로, 값이 치우치지 않도록 248 미만인 바이트만 쓴다.
 */
export function generateInviteCode(
  randomBytes: RandomBytes = browserRandomBytes,
): string {
  let code = "";
  while (code.length < INVITE_CODE_LENGTH) {
    for (const byte of randomBytes(INVITE_CODE_LENGTH * 2)) {
      if (byte < 248 && code.length < INVITE_CODE_LENGTH) {
        code += ALPHABET[byte % ALPHABET.length];
      }
    }
  }
  return code;
}
