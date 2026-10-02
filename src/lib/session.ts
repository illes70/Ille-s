/** Login cookie value derived from OCP_PASSWORD (Web Crypto: works in proxy and routes). */
export async function sessionToken(password: string) {
  const data = new TextEncoder().encode(`ocp:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
