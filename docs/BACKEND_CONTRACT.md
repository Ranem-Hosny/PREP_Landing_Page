# ربط صفحة الهبوط بالباك إند — PREP

الواجهة مربوطة بقناة الدفع من الموقع في الباك إند (**CN-001**) في مستودع
`Standardized-Tests-Preparation-Platform`. المرجع الكامل هناك:
`docs/web-payments/INTEGRATION.md`. هذا الملف يلخّص ما يخص هذه الواجهة فقط.

الإعداد الوحيد في الواجهة: `assets/js/config.js` → `api.baseUrl` (شاملًا `/api/v1`).

---

## 1. قرارات الباك إند التي بُنيت عليها الواجهة

- **لا حساب ولا تسجيل دخول ولا OTP ولا سجل مشتريات على الموقع.** العميل ينشئ حسابه في التطبيق،
  ويكتب بريد ذلك الحساب مرتين عند الشراء. البريد يحدد لمن الشراء، ولا يمنح أي صلاحية.
- **الأسعار من الباك إند فقط** (`GET /public/web-offers`) — لا سعر ثابت في HTML.
- **الدفع في صفحة ميسّر المستضافة** (Invoice)، لا نموذج مدمج.
- **لا يُعتبر الطلب مدفوعًا إلا بتأكيد ميسّر للباك إند.** معاملات رابط العودة لا تُقرأ.
- **الاسترداد يقوم به فريق الدعم من لوحة ميسّر**؛ لا زر استرداد على الموقع.

## 2. المسار

| الخطوة | الطلب | الملف |
|---|---|---|
| عرض البطاقات | `GET /public/web-offers` | `landing.js` |
| تفاصيل العرض | `GET /public/web-offers/:offer_id` | `checkout.js` |
| حجز محاولة (قبل الإرسال) | `POST /public/web-checkout-attempts` → `attempt_id` + `checkout_token` | `checkout.js` |
| إرسال الطلب | `POST /public/web-checkout-attempts/:id/order` (202) | `checkout.js` |
| قراءة الحالة | `GET /public/web-checkout-attempts/:id` | `checkout.js` |

- `checkout_token` في `sessionStorage` (المفتاح `prep.checkout.attempt`) ويُرسل في `X-Checkout-Token`.
- كل الطلبات `credentials: 'omit'`، بلا `Authorization` (يرفضه الباك إند بـ 403).
- جسم الطلب خمسة حقول بالضبط: `offer_id`, `offer_version_id`, `recipient_email`,
  `recipient_email_confirmation`, `accept_terms`.

| `status` | ما تعرضه الواجهة |
|---|---|
| `processing` | «نجهّز صفحة الدفع…» ثم متابعة القراءة |
| `payment_required` | بعد الإرسال: تحويل إلى `checkout_url`. بعد العودة: «نتأكد…» 15 ثانية ثم «لم يصلنا تأكيد الدفع — أكمل الدفع / تحقّق مرة أخرى» |
| `confirmed` | النجاح وتعليمات التطبيق والبريد ورقم المرجع (LP-06) |
| `unavailable` | «لم يكتمل الدفع» + محاولة بطلب جديد |
| `contact_support` | «وصلنا دفعك — والتفعيل يحتاج مراجعة» + رقم المرجع — لا يُطلب الدفع مجددًا |
| `refunded` | «استُرد مبلغ هذا الطلب» |

القراءة كل 3 ثوانٍ، ثم كل 6 بعد 30 ثانية، وتتوقف بعد دقيقتين برسالة «ما زال طلبك قيد المعالجة».

| رمز الخطأ | ما تعرضه الواجهة |
|---|---|
| `VALIDATION_ERROR` | خطأ تحت الحقل المعني |
| `CHECKOUT_UNAVAILABLE` | رسالة عامة واحدة (مقصودة — لا تكشف وجود الحساب) |
| `QUOTE_EXPIRED` | يُعاد تحميل العرض ويُطلب تأكيد الإجمالي الجديد |
| `IDEMPOTENCY_CONFLICT` | محاولة جديدة ثم إعادة التأكيد |
| `CHECKOUT_NOT_FOUND` | عند الإرسال: محاولة جديدة تلقائيًا مرة واحدة. عند القراءة: إرشاد عام |
| `RATE_LIMITED` | الانتظار حسب `Retry-After` |
| `WEB_CHECKOUT_DISABLED` / `WEB_OFFER_NOT_FOUND` | «الشراء متوقف مؤقتًا» / «العرض لم يعد متاحًا» |

## 3. جدول التعديلات (LP-01 … LP-09)

| الرمز | التنفيذ |
|---|---|
| LP-01 | البطاقات تُبنى من العروض المنشورة؛ الدورات في بطاقة واحدة بقائمة اختيار، ولكل باقة بطاقتها |
| LP-02 | أزرار الشراء → `checkout.html?offer=…`، و«مشترياتي» في التنقل، وشرح الفرق بين الموقع والتطبيق |
| LP-03 | بريد حساب التطبيق مرتين + الموافقة على الشروط (بديل OTP حسب قرار الباك إند)، والاختيار محفوظ في الرابط |
| LP-04 | ملخّص: مدة الوصول، بدون تجديد، السعر قبل الضريبة، الضريبة، الإجمالي من الباك إند، ثم صفحة ميسّر |
| LP-05 | حالات المعالجة والنجاح والفشل وإعادة المحاولة من `GET` الحالة فقط |
| LP-06 | بعد التأكيد: البريد المكتوب، خطوات فتح التطبيق، أزرار المتجرين، رقم المرجع |
| LP-07 | `account.html` صفحة إرشاد: المشتريات ومدة الوصول في التطبيق، الإيصال بالبريد، الاسترداد عبر الدعم |
| LP-08 | «كيف تعمل المنصة» والأسئلة الشائعة وJSON-LD محدّثة للمسار الفعلي |
| LP-09 | الروابط من `config.js` (تُحذف غير المضبوطة في `mode: 'production'`)، وحُذفت الأرقام والآراء والميزات غير الموجودة في الباك إند (الشهادات، العمل دون اتصال، العيّنات المجانية) |

## 4. التشغيل المحلي (دون تعديل ملفات الباك إند)

في مجلد الباك إند:

```bash
export WEB_PAYMENTS_PROVIDER=fake WEB_CATALOG_ENABLED=true WEB_CHECKOUT_ENABLED=true \
  WEB_ALLOWED_ORIGINS='["http://localhost:4173","http://127.0.0.1:4173","http://127.0.0.1:5500","http://localhost:5500"]' \
  WEB_CHECKOUT_RETURN_URL='http://127.0.0.1:5500/checkout.html' \
  WEB_SUPPORT_CONTACT='support@prep.sa' WEB_MAIL_PROVIDER=fake
docker compose up -d --build --wait
docker compose exec -T api alembic upgrade head
docker compose exec -T -e BOOTSTRAP_ADMIN_EMAIL=admin@example.com \
  -e BOOTSTRAP_ADMIN_PASSWORD=AdminPass123 -e BOOTSTRAP_ADMIN_NAME="Local Admin" api python -m scripts.seed
```

ثم من لوحة التحكم (أو `POST /api/v1/admin/web-offers` + `/publish` مع `If-Match`) أنشئ عرضًا
لدورة أو باقة منشورة وانشره. أنشئ حساب طالب من التطبيق (أو `POST /api/v1/auth/student/register`).

الواجهة: Live Server في VS Code (`http://127.0.0.1:5500`) أو `npx http-server . -p 4173 -c-1`.
عنوان الصفحة يجب أن يكون ضمن `WEB_ALLOWED_ORIGINS` حرفيًا، وإلا يرد الباك إند `403 ORIGIN_NOT_ALLOWED`
(«تعذّر إتمام الطلب بسبب إعدادات الموقع»). و`WEB_CHECKOUT_RETURN_URL` يجب أن يكون على العنوان نفسه
الذي بدأ منه الشراء، لأن محاولة الشراء محفوظة في `sessionStorage` الخاص بذلك العنوان.

**حدود وضع `fake`:** `checkout_url` يشير إلى `https://fake-checkout.localhost/...` غير الموجود، ولا يمكن
إكمال الدفع من المتصفح. التحقق من `confirmed` يتم في sandbox ميسّر.

## 5. قائمة ما قبل الإطلاق

**الواجهة**
- [ ] `config.js` → `api.baseUrl` الحقيقي (https)
- [ ] `checkout.html` → أضف عنوان الباك إند إلى `connect-src` في CSP واحذف `http://localhost:8000`
- [ ] `links.*` (الشروط، الخصوصية، الاسترداد، بريد الدعم، المتجران، الحسابات)، ثم `mode: 'production'`
- [ ] محتوى الصفحة: كل نص أو رقم يجب أن يكون من الـ API أو حقيقة في كود الباك إند — لا أرقام أو آراء مؤلَّفة
- [ ] الدومين في `canonical` و`og:url` و`og:image` وJSON-LD و`sitemap.xml`
- [ ] حذف `*.bak` من الخادم

**متغيرات بيئة الباك إند (من فريق التشغيل)**
- [ ] `WEB_ALLOWED_ORIGINS` = دومين الموقع بالضبط (https)
- [ ] `CORS_ALLOWED_ORIGINS` يتضمن دومين الموقع (وإلا يمنع المتصفح الطلبات)
- [ ] `WEB_CHECKOUT_RETURN_URL` = `https://<الدومين>/checkout.html`
- [ ] `WEB_SUPPORT_CONTACT`، ومفاتيح ميسّر، وSMTP للإيصالات — راجع `docs/web-payments/RELEASE_INPUTS.md`
- [ ] عروض منشورة من لوحة التحكم (بدونها تظهر «لا توجد دورات أو باقات متاحة»)
