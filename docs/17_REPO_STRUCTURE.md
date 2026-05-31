# 17 — Repository Structure

## 1. Recommended repo

```text
cago/
  README.md
  CLAUDE.md

  docs/
    01_PRD.md
    02_ARCHITECTURE.md
    ...
    19_DEPLOYMENT_PLAN.md

  prompts/
    MASTER_PROMPT_FOR_CLAUDE_CODE.md
    POS_AWESOME_EVALUATION_PROMPT.md

  data/
    sample_products.csv
    custom_fields_spec.csv

  frappe-apps/
    cago/
      cago/
        api/
          kiosk.py
          staff.py
          owner.py
          pos.py
          chatbot.py

        cago/
          doctype/
            cago_product_alternative/
            cago_wanted_list/
            cago_owner_action_log/

        www/
          owner/
          staff/
          kiosk/

        public/
          css/
          js/
          images/

        fixtures/
        hooks.py
        patches.txt
        pyproject.toml

  services/
    chatbot_service/
    sync_service/
    image_service/
    zalo_service/

  scripts/
    import_products.py
    export_fixtures.py
    backup.sh
    restore.sh

  infra/
    docker/
    bench/
    nginx/
```

## 2. MVP repo simplification

In MVP, only these are required:

```text
docs/
prompts/
data/
frappe-apps/cago/
scripts/
```

Do not create `services/` until needed.

Do not create `kiosk-app/` until Phase 2.

## 3. Naming

Use `cago_` prefix for custom fields:

```text
cago_display_name
cago_local_names
cago_staff_advice
```

Use `Cago` prefix for custom DocTypes:

```text
Cago Product Alternative
Cago Wanted List
Cago Owner Action Log
```

## 4. API modules

```text
cago/api/kiosk.py
cago/api/staff.py
cago/api/owner.py
cago/api/pos.py
cago/api/chatbot.py
```

## 5. UI files

MVP:

```text
www/owner/
www/staff/
www/kiosk/
```

Phase 2 standalone kiosk:

```text
kiosk-app/
```
