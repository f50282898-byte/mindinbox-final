/**
 * حماية أصل الطلب (Origin) ضد هجمات CSRF وتزوير الطلبات عبر المواقع.
 *
 * تُستخدم في مسارات API التي تقبل طلبات POST/PUT/DELETE، وتتحقق من أن ترويسة
 * `Origin` (إن وجدت) تطابق مضيف الطلب الحالي. إذا اختلف الأصل، يُرفض الطلب برمز 403.
 *
 * تُسمح بمضيفات `localhost` و `127.0.0.1` في بيئة التطوير/الاختبار دون تحميل
 * طلبات Origin، لأن المطور قد يشغل الواجهة والخادم على منافذ مختلفة.
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

  // مضيفات التطوير المسموح بها دائماً.
  const devHosts = ["localhost", "127.0.0.1"];

  const allowedHosts = [host, forwardedHost].filter(Boolean) as string[];

  // الأصل مسموح به إذا تطابق مضيفه مع مضيف الطلب أو مع أحد مضيفات التطوير.
  return allowedHosts.some((h) => {
    if (devHosts.includes(h)) return true;
    try {
      const originUrl = new URL(origin);
      return originUrl.host === h;
    } catch {
      return false;
    }
  });
}
