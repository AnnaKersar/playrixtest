# Технический разбор Playrix / AI Card Studio
Срез кода: 10 октября 2026, 17:10 UTC. Проверенный main: `1f21707868438da19b70e70c7b838bd82ffb1a19`, commit time 16:49:49 UTC.

## Степень подтверждения
- **Код подтверждён:** чтение GitHub-коннектором зафиксированного commit, перечисленного ниже. Это не запуск приложения.
- **Развёртывание:** этот аудит не устанавливает соответствие рабочего сайта данному commit и не открывает закрытые API/status/journal. Настройки в wrangler — конфигурация репозитория, не доказательство текущих cloud bindings или секрета.
- **Тесты:** просмотрен исходный код тестов и историческое заявление автора commit. Тесты не запускались. Для точного head GitHub-коннектор вернул пустой список workflow_runs, поэтому нельзя утверждать CI green.
- **Причина прежних зависаний:** не установлена. Наличие оптимизаций CPU/памяти не доказывает конкретную причину сбоя. Валидность конкретного старого raw PNG здесь не проверена.
- **Предложения** в конце не реализовывались в рамках аудита.

## Главная поправка к старому описанию
README описывает ранний mock/MVP и расходится с актуальным кодом: там «paid disabled», старые размеры 1376×1536 → 860×960, отсутствие deployed Cloudflare и прежний semantic policy. Сейчас конфигурация разрешает owner live planner/image path; новый run фиксирует native=final=864×960; новые live items обязаны быть whole_card; compiler допускает согласованное наполнение корзин и декор крупных поверхностей. Публичным гостям платная генерация по-прежнему запрещена. Live-флаги не обходят owner authentication, budget и private reference pins.
Источники: [cloudflare/worker.mjs:56-83](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L56-L83); [cloudflare/public-guests.mjs:73-95](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/public-guests.mjs#L73-L95); [cloudflare/object-content-policy.mjs:4-5](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/object-content-policy.mjs#L4-L5); [wrangler.jsonc](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/wrangler.jsonc).

## Текущая схема для технического фрейма
Браузерный brief → stable request IDs / локальное восстановление → text planner → строгая schema + смысловые/category проверки → deterministic prompt compiler → frozen run в R2 + jobs/outbox в D1 → IMAGE_JOBS → проверка reference proofs → immutable experiment input → atomic paid claim → единственная image-provider отправка → raw PNG + receipt в R2 → known usage accounting в D1 → FINAL_JOBS → проверка PNG/размеров/alpha → final PNG + manifest в R2 → complete в D1 → просмотр/сравнение → отдельная версия правки → явное Apply.

Отдельная историческая ветка: сохранённый transparent foreground → procedural compositor / browser editor → новая сборка с provenance → предыдущая сборка сохранена. Эта ветка не является обязательным этапом новых whole-card generations.

### 1. Frontend и оркестрация
Статические HTML/CSS/ES modules обслуживает Cloudflare Assets через visitor-entry и публичный allowlist. Генератор сохраняет pending planner/run keys в localStorage; использует Web Locks, когда доступен, и общий poll gate между вкладками. Повторные запросы опираются на стабильные серверные IDs. Polling, переход на другую страницу, возврат вкладки и background edit tracker предназначены для продолжения наблюдения, а не повторной оплаченной отправки.

Количество: до 30 карт за запуск; в одной тематической категории 1–15; типовой микс на 10 — 3 C1, 1 C2, 2 C3, 4 C4. Для иных размеров mix рассчитывается пропорционально с поправкой представленности. Тематическая категория («Джаз-клуб») отличается от production type C1–C4.

**Важно:** основной generator автоматически превращает валидный план в image run: plannedCollection возвращает approved:true, а background controller посылает /api/runs. Нельзя рисовать обязательную ручную кнопку «утвердить план» между этими стадиями. В интерфейсе есть пользовательский запуск и отдельные approval markers для paid операций, но маркер в payload сам по себе не является дополнительной проверкой реального согласия вне приложения.
Источники: [cloudflare/visitor-public/generator-model.mjs:5-44](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/visitor-public/generator-model.mjs#L5-L44); [cloudflare/visitor-public/generation-background.mjs:35-71](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/visitor-public/generation-background.mjs#L35-L71); [cloudflare/visitor-public/studio/flow-model.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/visitor-public/studio/flow-model.mjs).

### 2. Planner и compiler
Text planner использует Responses API, модель в коде gpt-6-sol, store:false, JSON Schema strict. Timeout 180 секунд, redirects запрещены проверкой manual response. Output budget масштабируется от 12k до 48k токенов. Проверяются схема, hash/version immutable Art Direction, inventory, unique subjects, category mix и narrative sequence. Даже invalid/refused response может иметь известную стоимость: receipt сохраняется.

Compiler собирает pinned Art Direction + generalized rules + art-direction policy + content policy + collection rules + object brief + generation contract + palette/pattern variation. Он не является вторым AI: это воспроизводимая сборка текста. Frozen run сохраняет version/hash prompt policies, references, native/final size, объект и generation contract.

Свежие live запросы принимаются только whole_card и living_creatures='none'. C1 — изолированный предмет на оформленном фоне без плоскости; C2 — предмет на простой full-width плоскости; C3 — предмет с содержательной развитой поверхностью на базовом фоне; C4 — сцена/пространственная среда без стандартного абстрактного backdrop. Большая часть художественных условий пока является prompt contract и pending visual review, а не измеренной автоматической гарантией.
Источники: [cloudflare/text-planner.mjs:8-53](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/text-planner.mjs#L8-L53); [cloudflare/object-content-policy.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/object-content-policy.mjs); [cloudflare/generation-contract.mjs:31-45](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/generation-contract.mjs#L31-L45); [cloudflare/worker.mjs:171-192](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L171-L192).

### 3. Reference pack и immutable input
Рабочий pinned pack требует 50 sources на 13 sheets (12×4+2), manifest SHA, Art Direction SHA, image-model contract. Это не весь публичный reference library: 160 публичных original seeds и 50-source generation pack — разные сущности.

prepareSheets проверяет максимум один непризнанный sheet за queue invocation до paid claim. Proof привязан одновременно к key, expected SHA и R2 etag. После проверки job снова ставится в очередь; при совпадении всех proofs sheets читаются с повторной etag-проверкой. Изменение объекта обнуляет доверие к proof. Это уменьшает повторные hash-проходы, сохраняя связь с конкретной версией R2.
Источники: [cloudflare/worker.mjs:47-54](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L47-L54); [cloudflare/reference-sheets.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/reference-sheets.mjs).

### 4. D1/R2/Queues
D1 — состояние runs/jobs/attempts, бюджет, reviews/events, sessions, edit relations. R2 — frozen inputs, raw/final PNG, receipts, manifests, reference packs, diagnostic fallback. Это разные зоны отказа: между R2 и D1 нет единой транзакции.

Run identity выводится из principalId + requestId; тот же ID с другими frozen inputs даёт 409 conflict. Jobs и outbox создаются D1 batch. Dispatch отправляет pending outbox, затем маркирует sent. При сбое после send до sent возможна повторная delivery, поэтому критичен отдельный atomic claim в attempts.

IMAGE_JOBS и FINAL_JOBS имеют max_batch_size=1, max_concurrency=1, max_retries=0. Planner делит image queue. Handoff finalization несёт parent execution ID. Код поддерживает fallback на IMAGE_JOBS при отсутствии FINAL_JOBS, хотя основной config задаёт обе. Отсутствие retries — осознанное ограничение денежных рисков, но требует наблюдаемого восстановления неотправленной/нефинализированной работы.

**Не заявлять:** «сейчас установлен повышенный cpu_ms». Commit 5450eba удалил custom cpu_ms для совместимости с текущим Free plan; current wrangler не содержит limits.cpu_ms.
Источники: [cloudflare/worker.mjs:55-83](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L55-L83); [cloudflare/worker.mjs:167-169](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L167-L169); [wrangler.jsonc](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/wrangler.jsonc); [5450eba](https://github.com/AnnaKersar/playrixtest/commit/5450ebaad1da95996919525a301ad959241ac4d2).

### 5. Paid request и guardrails
Перед отправкой durable claim атомарно проверяет approved baseline, historical unknown=0, отсутствие unresolved попыток и общий remaining. Owner image reservation в текущем коде — $10 за попытку; project ceiling в коде не выше $100. Non-owner lifetime shared ceiling — $5, и для их live admission требуется cost-bound evidence; публичный visitor path в любом случае оставляет только mock.

Это **резервы и application admission limits**, не provider-side hard cap и не подтверждение фактического счёта. Usage estimate вычисляется из token details по таблице кода; journal прямо помечает её как не независимо reverified for live admission. Unknown billing не превращается в нулевую стоимость. Поздняя reconciliation policy может закрывать unknown с сохранением $1 reserve и actual=null: это разрешение продолжить в рамках учетной политики, не доказательство $1 расхода и не гарантированный upper bound.

Image provider: один POST image edits, 13 sheets (при correction добавляется source image), medium PNG, один output, native 864×960 для новых run, timeout 240s, manual redirect rejection; без SDK retry, model fallback или автоматического replay. После любого existing attempt повторный provider send блокируется.
Источники: [cloudflare/budget.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/budget.mjs); [cloudflare/provider.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/provider.mjs); [cloudflare/worker.mjs:192-224](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L192-L224); [cloudflare/worker.mjs:406-434](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L406-L434).

### 6. Durability, finalization, recovery
Порядок: provider return → journal evidence → raw R2 → receipt R2 → receipt path/status D1 → known usage settlement → finalization queue. Ошибка дальнейшего PNG/queue/storage не стирает settled actual и paid claim.

Finalization читает сохранённый raw и проверяет SHA. Для native whole-card RGB есть быстрый путь: размер, PNG chunks/CRC, отсутствие tRNS. Для RGBA выполняется decode и pixel-alpha validation; whole card требует полной opacity. При совпадающем native size новый output сохраняется без resize. Legacy resize сохраняет прежние размеры/обработку. Затем final PNG/manifest в R2 и results/jobs в D1.

Recovery с receipt — переработка сохранённых bytes без provider. No-receipt/unknown не допускает повторную отправку той же попытки. Cancelled run защищён marker, который проверяется до исполнения; это не отмена уже отправленного provider запроса и не refund.

**Граница проверки:** быстрый native RGB путь не распаковывает IDAT и не валидирует все scanlines. CRC и правильный IHDR не равны проверке декодируемости всего изображения. Это подтверждённая граница реализации, но не доказанная причина какого-либо текущего дефекта.
Источники: [cloudflare/worker.mjs:85-135](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L85-L135); [cloudflare/worker.mjs:197-224](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L197-L224); [cloudflare/worker.mjs:357-401](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L357-L401); [cloudflare/png.mjs:89-136](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/png.mjs#L89-L136).

### 7. Art compositor и новая правка карточки
Исторический proceduralCard создаёт bright radial gradient, concentric rings и category-dependent surface; измеряет silhouette по alpha, выбирает palette по hue separation, работает premultiplied sampling. C2 либо сохраняет generated surface/shadow без второй тени, либо рассчитывает surface-only alpha-projected shadow по light direction. Assemblies versioned, source foreground и предыдущий final сохраняются. Поддерживается browser reassembly + server validation/save без новой AI generation.

Новый card correction работает иначе: finished whole card + исходный frozen prompt/contract + замечание → новая run/job/version с SHA-pinned source. Request ID устойчив; исходник не перезаписывается. Apply разрешён только owner, для completed linked edit с существующим final R2, и сохраняет pointer к выбранной версии корневой карточки. Background tracker только читает статус, сохраняет completion и показывает уведомление после возвращения видимой вкладки.
Источники: [cloudflare/visitor-public/studio/procedural-card.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/visitor-public/studio/procedural-card.mjs); [cloudflare/worker.mjs:137-165](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L137-L165); [cloudflare/worker.mjs:243-275](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/worker.mjs#L243-L275); [cloudflare/visitor-public/card-edit-background.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/visitor-public/card-edit-background.mjs).

### 8. Observability и безопасность
Processing diagnostics: run/job/attempt/execution IDs, sequence, stage started/succeeded/failed, timestamps, elapsed/stage time, byte sizes и dimensions. Запись stage-start awaited перед работой. D1 journal failure → отдельные R2 events; progress snapshot в R2; telemetry-degraded явно отмечается. Arbitrary exception text не пишется image processing telemetry: allowlisted codes/messages. 20-minute deadline означает unconfirmed/stale, не «worker убит» и не разрешение retry. История хранит несколько executions, включая вытесненные duplicate progress и handoff.

Public UI/API ограничены allowlists. Guest rate limits, hashed random session tokens, Secure/HttpOnly/SameSite cookies, owner-only raw/manifest/accounting/correction routes, same-origin writes, bounded JSON bodies, CSP. Default visitor entry injects owner session identity; старый Cloudflare Access JWT auth существует отдельно и не является обязательным public login layer.

Граница: planner error path ещё сохраняет truncated arbitrary message; единый sanitizer покрывает image processing лучше, чем весь проект. Публичный generation-status stage allowlist отстаёт от новых stage names: новый stage может выглядеть как no_worker_receipt. CF_VERSION_METADATA ожидается diagnostic кодом, но binding в проверенном wrangler не объявлен, поэтому deploy_version может быть null. Это вопросы улучшения, не наблюдение утечки.
Источники: [cloudflare/processing-diagnostics.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/processing-diagnostics.mjs); [cloudflare/experiment-journal.mjs:1-18](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/experiment-journal.mjs#L1-L18); [cloudflare/public-guests.mjs:45-95](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/public-guests.mjs#L45-L95); [cloudflare/owner-session.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/owner-session.mjs); [cloudflare/text-planner.mjs:57-67](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/cloudflare/text-planner.mjs#L57-L67).

## Сильные стороны, которые можно честно показать
1. Платная попытка имеет durable identity, frozen inputs и immutable journal; duplicate delivery не равна duplicate charge request.
2. Известная стоимость отделена от успешности post-processing: не нужно платить ещё раз, чтобы сохранить уже полученный PNG.
3. Сохранение raw+receipt до тяжёлой обработки делает recovery проверяемым и ограниченным.
4. Versioned prompt/reference/policy hashes и etag-bound proofs дают воспроизводимую provenance.
5. Guest/owner разделение и public allowlists сокращают случайное раскрытие private inputs.
6. Immutable originals, отдельные edit versions и Apply pointer делают художественную итерацию обратимой.
7. Code уже различает technical complete, visual review и relative preference; не выдаёт technical QA за artistic acceptance.

## Приоритетные улучшения — предложения
### P0: контракт и выпуск
Обновить README/VERIFICATION и единый versioned architecture contract: current whole_card/native864, legacy modular, public vs owner, model/price assumptions. Добавить безопасный build/deploy SHA в публичный shell и CF_VERSION_METADATA binding, связать CI evidence с exact commit. Критерий: любой screenshot/public case имеет дату/commit и не путает deployed с source.

### P0: финансовая и recovery-модель
Сделать проверенную таблицу цен/entitlement частью versioned admission config; показывать reserve, usage estimate и invoice actual раздельно. Unknown закрывать отдельным resolved-by-policy статусом с полным audit trail; не рекламировать $1/$10 как provider cap. Добавить crash-window reconciliation для raw-without-receipt, receipt-without-D1, queued-but-not-delivered, сохраняя single-send. Критерий: fault injection не приводит ни к автоматическому повторному provider call, ни к незаметному исчезновению unknown liability.

### P1: тесты и PNG integrity
Собрать единый test command/CI из распределённых scripts; обновить устаревший worker suite под asynchronous finalization. Проверять queue drain, duplicate/parallel messages, cancelled-before/after-send, reference proof change, R2/D1 partial failure, edit/apply lineage. Для native RGB добавить bounded decode/scanline integrity или отдельную асинхронную decoder verification перед technical-complete; тест CRC-valid, но malformed IDAT. Измерять Worker CPU/memory/wall отдельно в контролируемом окружении. Критерий: exact-head report с passed/failed/not-run, без заявления root cause по одному timeout.

### P1: единый диагностический словарь
Согласовать public stage projection, owner stage journal и UI; не показывать no_worker_receipt для известной стадии. Распространить allowlisted error sanitizer на planner/API пути. Гарантировать deploy/version correlation. Критерий: публичные события не содержат prompts, headers, credentials, billing/private IDs, а владелец может различить queued, validating refs, provider pending, raw saved, finalization и needs_review.

### P2: художественное качество
Чётко разделить hard technical gates (formats/dimensions/opacity), prompt-based intentions (framing/palette/subject construction) и human/blind evaluation. Frozen rubric + held-out references + controlled comparison protocol; повторяемые defect labels вместо безусловного «accepted». Это предложенная оценка, не реализованный AI ranker или доказательство роста качества.

## Проверки и ограничения тестового свидетельства
- af233d7 от 03:34:01 UTC сообщает 23 offline diagnostic cases, journal tests и 5 generation-mode checks; тот же commit явно отмечает baseline asynchronous-finalization failure в existing worker suite.
- Текущие test_processing_diagnostics содержат failure injection в decode/resize/encode, R2, D1, queue send, telemetry, concurrent claim/recovery, stale deadline, alpha rejection и no paid replay.
- test_reference_sheets покрывает incremental proofs, reuse, version invalidation, corruption.
- test_png_bounded_decode покрывает RGB/RGBA filters 0–4, partial alpha, bounded inflate, truncation/filter/CRC/tRNS.
- test_card_correction_route покрывает owner gate, stable edit, original preservation, complete-linked apply и no new generation on apply.
- test_card_edit_background покрывает read-only polling, migration, hidden-tab deferral, once-only toast.
- Историческая docs/VERIFICATION перечисляет local Python/browser checks раннего MVP; нельзя суммировать их с сегодняшними как единый актуальный green suite.

Источники: [af233d7](https://github.com/AnnaKersar/playrixtest/commit/af233d776d80d4e552d66779aad3be5ae3985347); [scripts/test_processing_diagnostics.mjs:39-123](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/scripts/test_processing_diagnostics.mjs#L39-L123); [scripts/test_worker.mjs:25-33](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/scripts/test_worker.mjs#L25-L33); [scripts/test_reference_sheets.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/scripts/test_reference_sheets.mjs); [scripts/test_png_bounded_decode.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/scripts/test_png_bounded_decode.mjs); [scripts/test_card_correction_route.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/scripts/test_card_correction_route.mjs); [scripts/test_card_edit_background.mjs](https://github.com/AnnaKersar/playrixtest/blob/1f21707868438da19b70e70c7b838bd82ffb1a19/scripts/test_card_edit_background.mjs).

## Ключевые изменения 10 октября, UTC
- 03:34 af233d7: per-execution diagnostics, safe errors, billing preserved on finalization failure.
- 03:53 348a5bc: native864×960, direct size instead of resize for new output.
- 04:29 986cb42: browser-rendered stored-card assembly, validated save without provider.
- 05:28 f9f81aa: stored PNG recovery/codec optimisation.
- 06:08 9aeaedf: whole-card generation for collection items.
- 06:43 c298d22: enforced whole-card live admission; unclaimed legacy modular jobs blocked.
- 07:02 6a6719b: standard 3/1/2/4 mix.
- 10:19 e715d51: reconcile previous accounting without provider replay.
- 10:48 5450eba: remove custom CPU limit, retain Free-plan-deployable config.
- 10:53 810a4e2 / afa2c86: up to30 cards, boundary test.
- 11:00 b5e9c31: output-token budget scales to30.
- 14:04 b25a183: incremental reference proofs bound to R2 object versions.
- 14:13 247fb72: compact polls avoid reparsing full planner receipt.
- 14:25 f2fec2c: separate finalization queue/native RGB CRC.
- 16:38 3013bff: correction editor with versioned API edits.
- 16:49 1f217078: background progress + explicit Apply to collection.

Commit time is source-history evidence, not deployment time. Immutable file links and audit boundaries are included above.

## Финальное обновление среза: 17:12:40 UTC
Во время аудита main обновился до [86c461bf74cb232dbb57fd92a298b05ee3f86b50](https://github.com/AnnaKersar/playrixtest/commit/86c461bf74cb232dbb57fd92a298b05ee3f86b50). Полный diff прочитан. Он не меняет описанный backend/compiler/provider/budget pipeline. Добавлены collection-download.mjs, generator control, public module allowlist и test_collection_download.mjs.

Текущий output этап дополнен: **вся готовая коллекция → загрузка PNG bytes → один ZIP в браузере**. Все jobs должны быть complete; каждый asset запрашивается последовательно с 60-second timeout, проверяется PNG signature; ZIP хранит bytes без canvas decode, resize или re-encode, с UTF-8 names и CRC32. Повторное нажатие блокируется во время download. В ZIP включаются все jobs, а не только текущая страница из 10.

Семантическое уточнение: используется /api/asset без original=1, поэтому действуют текущие Apply pointers. «Original PNG files» в названии commit означает сохранение PNG bytes, а не принудительный экспорт старой версии до правки. Browser ZIP объединяет отдельно загруженные files; если Apply изменится в другой вкладке во время download, атомарный единый version snapshot не гарантирован. Предложение: pin selected result hashes/versions в export manifest и добавить manifest с provenance; это пока не реализовано.

Новый test проверяет 30 fetches, CRC, numbered paths, queued-job отказ и non-PNG signature отказ на synthetic fixtures. В этом аудите не запускался. Источник: [collection-download.mjs:1–6](https://github.com/AnnaKersar/playrixtest/blob/86c461bf74cb232dbb57fd92a298b05ee3f86b50/cloudflare/visitor-public/collection-download.mjs#L1-L6), [test_collection_download.mjs](https://github.com/AnnaKersar/playrixtest/blob/86c461bf74cb232dbb57fd92a298b05ee3f86b50/scripts/test_collection_download.mjs). Deployment parity этого commit не проверена.
