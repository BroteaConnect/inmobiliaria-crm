# CRM Inmobiliaria

Panel privado del sistema inmobiliario de Brotea: pipeline de leads en
tiempo real, inventario de propiedades con fotos e importación desde Excel
(CSV). App react de la fábrica Brotea (tema `brotea`, analítica, errores y
backend PocketBase vía los bricks estándar).

- **Producción**: https://crm-inmobiliaria.brotea.dev
- **Web pública** (repo hermano, proyecto de referencia con el modelo de
  datos y la doc de arquitectura): https://github.com/BroteaConnect/inmobiliaria
- **Para desarrollar aquí**: lee `.claude/skills/crm-dev/SKILL.md`.

```bash
npm install
npm run dev      # desarrollo local (necesita PUBLIC_PB_URL en el entorno)
npm run build    # build de producción (lo ejecuta la CI)
```
