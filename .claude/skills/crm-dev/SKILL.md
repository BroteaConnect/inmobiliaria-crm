---
name: crm-dev
description: Cómo está organizado el CRM inmobiliario y cómo añadirle funcionalidad sin romper las convenciones — úsala antes de tocar cualquier código de este repo.
---

# Desarrollar en el CRM

Arquitectura completa del producto: `docs/architecture.md` del repo hermano
`BroteaConnect/inmobiliaria` (proyecto de referencia). Este repo es solo la
SPA privada.

## Mapa

- `src/crm/api.ts` — ÚNICA puerta a los datos: tipos + helpers sobre
  `src/lib/pb.ts` (cliente PocketBase de la fábrica, sin dependencias).
  Cualquier acceso nuevo a datos se añade aquí, tipado.
- `src/crm/Kanban.tsx` — pipeline de leads. Etapas en `ETAPAS` (api.ts);
  para añadir una etapa: primero el `select` en `pb/schema.json` del repo
  hermano (skill `pb-schema`), luego `ETAPAS` y `TITULOS`.
- `src/crm/Propiedades.tsx` — inventario + alta con fotos + publicar/retirar.
- `src/crm/Importar.tsx` — wizard CSV (parser propio; mapeo de columnas con
  autodetección en `adivina()` — amplía ahí los sinónimos de cabeceras).
- `src/crm/crm.css` — estilos SOLO con tokens del tema (var(--…)); nunca
  colores a pelo (contrato: docs/theme-contract.md de la fábrica).
- `src/App.tsx` — shell: gate de login + pestañas. Las features de la
  fábrica se registran solas vía `src/features/registry.tsx` (anclas
  brotea: — no las borres).

## Reglas del proyecto

- El realtime ya está: `onLeadsChange()` recarga el kanban en cada cambio de
  `leads` (SSE). Suscripciones nuevas → mismo patrón en api.ts.
- Login = colección `users` de PocketBase (credenciales demo:
  `~/.config/brotea/inmobiliaria-crm-user.env` en el host de la fábrica).
- Nada de librerías nuevas sin justificación fuerte: el proyecto es
  deliberadamente dependency-free más allá de react + react-router.
- Pipeline estándar de la fábrica: rama → PR → CI verde → auto-merge →
  deploy. El deploy re-ejecuta provision-services (idempotente).
