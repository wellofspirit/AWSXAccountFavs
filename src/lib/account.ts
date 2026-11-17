export interface AccountInfo {
  accountId: string | null;
  alias: string | null;
}

/**
 * Best-effort current-account detection from the console DOM/cookies.
 * Primary source is the `aws-userInfo` cookie (readable, not HttpOnly);
 * falls back to scraping the account label in the top-right nav.
 */
export function detectAccount(): AccountInfo {
  const fromCookie = accountFromCookie();
  if (fromCookie.accountId) return fromCookie;
  return accountFromLabel();
}

function accountFromCookie(): AccountInfo {
  const m = /aws-userInfo=([^;]+)/.exec(document.cookie);
  if (!m) return { accountId: null, alias: null };
  try {
    const info = JSON.parse(decodeURIComponent(m[1])) as {
      arn?: string;
      alias?: string;
    };
    const arnAcct = info.arn ? /::(\d{12}):/.exec(info.arn)?.[1] ?? null : null;
    return { accountId: arnAcct, alias: info.alias ?? null };
  } catch {
    return { accountId: null, alias: null };
  }
}

function accountFromLabel(): AccountInfo {
  const el = Array.from(document.querySelectorAll("span,div")).find(
    (e) => e.childElementCount === 0 && /\(\d{12}\)/.test(e.textContent ?? ""),
  );
  const text = el?.textContent ?? "";
  const id = /\((\d{12})\)/.exec(text)?.[1] ?? null;
  const alias = text.replace(/\s*\(\d{12}\)\s*/, "").trim() || null;
  return { accountId: id, alias };
}
