# POS Awesome V15 Evaluation Prompt

You are evaluating whether POS Awesome V15 should be used as the main POS UI for an ERPNext v16 agricultural store project.

Do not assume it is safe just because it installs. Evaluate:

1. Compatibility with current ERPNext/Frappe version.
2. Installation reproducibility.
3. Whether POS Profile works.
4. Item image display.
5. Search speed with 500/2000/10000 products.
6. Barcode support if available.
7. Touch/tablet usability.
8. Offline/cache behavior if any.
9. Stock sync correctness.
10. Sales invoice/POS invoice correctness.
11. Payment methods.
12. Upgrade risk.
13. Code quality and maintainability.
14. Whether it can integrate with `cago` without core modifications.
15. Whether native ERPNext POS remains usable as fallback.

Deliver:

- Pass/Fail recommendation.
- Issues found.
- Required patches/config.
- Fallback plan.
- Whether to use POS Awesome in MVP or only after MVP.
