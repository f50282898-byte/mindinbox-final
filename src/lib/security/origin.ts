/**
 * حماية أصل الطلب (Origin) ضد هجمات CSRF وتزوير الطلبات عبر المواقع.
 *
 * تُستخدم في مسارات API التي تقبل طلبات POST/PUT/DELETE، وتتحقق من أن ترويسة
 * `Origin` (إن وجدت) تطابق مضيف الطلب الحالي. إذا اختلف الأصل، يُرفض الطلب برمز 403.
 *
 * المضيفات المسموح بها:
 *  - مضيف الطلب الحالي (host / x-forwarded-host)
 *  - *.pages.dev  (بيئة Cloudflare Pages)
 *  - localhost و 127.0.0.1  (بيئة التطوير والاختبار)
 */
export function verifySameOrigin(request: Request): boolean {
  const method = request.method;

  // فقط طرق التعديل تخضع لفحص Origin؛ GET و HEAD و OPTIONS معفاة.
  if (method !== "POST" && method !== "PUT" && method !== "DELETE") {
    return true;
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const forwardedHost = request.headers.get("x-forwarded-host");

  // إذا لم تُرسل ترويسة Origin (مثل طلب من نفس الأصل عبر fetch بدون cross-origin)،
  // نعتبره آمناً افتراضياً لأن نفس الموقع لا يُرسل Origin دائماً في طلبات same-origin.
  if (!origin) return true;

  // مضيفات التطوير والنشر المسموح بها دائماً.
  const devHosts = ["localhost", "127.0.0.1"];

  const allowedHosts = [host, forwardedHost].filter(Boolean) as string[];

  // الأصل مسموح به إذا تطابق مضيفه مع مضيف الطلب أو مع أحد مضيفات التطوير أو *.pages.dev.
  return allowedHosts.some((h) => {
    // مضيفات التطوير المحلية — مسموح بها دائماً بغض النظر عن المنفذ.
    if (devHosts.some((d) => h.startsWith(d))) return true;

    try {
      const originUrl = new URL(origin);

      // تطابق تام مع مضيف الطلب.
      if (originUrl.host === h) return true;

      // بيئة Cloudflare Pages: أي نطاق فرعي من *.pages.dev مسموح.
      if (originUrl.hostname.endsWith(".pages.dev")) return true;

      return false;
    } catch {
      return false;
    }
  });
}