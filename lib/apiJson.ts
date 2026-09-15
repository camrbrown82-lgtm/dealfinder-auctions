export async function parseApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    throw new Error(response.ok ? "Empty response." : `Request failed (${response.status}).`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const compact = text.replace(/\s+/g, " ").trim();
    if (response.status === 413 || /^request entity too large/i.test(compact)) {
      throw new Error("Photos were too large to send. Use smaller pictures or wait for them to upload first.");
    }
    throw new Error(compact.slice(0, 220) || `Request failed (${response.status}).`);
  }
}
