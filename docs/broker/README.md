# Simon Broker — Documentación del producto

Carpeta de trabajo para **Simon Broker**, el tier SaaS pago (Bs. 75-210/mes) sobre la plataforma Simon dirigido a brokers inmobiliarios en Equipetrol.

## Índice

| Archivo | Propósito |
|---|---|
| [PRD.md](PRD.md) | Product Requirements Document del MVP mínimo. Scope congelado, cronograma 3 semanas, decisiones tomadas. |
| [BACKLOG.md](BACKLOG.md) | Ideas parqueadas para v2+. Cada entrada con rationale de por qué no entra al MVP. |

## Principio rector

> **Honestidad profesional como moat. Profesional, no mentiroso.**

El broker que use Simon tiene que poder defender cualquier número del producto ante un cliente que pregunte "¿cómo lo calculaste?". Data verificable, metodología transparente, sin supuestos ocultos.

## Estado actual

- **Fase:** S0, S1 y S2 completados — listo para mergear `broker-s2-wip` → `main` y avanzar a S3
- **Última actualización:** 2026-04-23
- **Cronograma:** S3 (link a mercado + slugs founders + testing) pendiente — 3-4 días dev + 1 semana feedback
- **Target founding:** 15-25 brokers en 60-90 días post-deploy
- **Auth:** no al inicio (slug en URL). Se agrega cuando crezca la base o haya datos sensibles.
- **Migraciones aplicadas:** 228 (tablas), 229 (snapshot RAW), 230 (snapshot normalizado)

## Cómo trabajar con esta carpeta

1. **Todas las ideas nuevas van al BACKLOG.md** con una línea de rationale. Zero debate en el momento.
2. **El PRD se actualiza** cuando una idea del backlog se promueve al MVP o cuando termina una feature (se marca completada).
3. **Nada se borra** — incluso ideas descartadas quedan con la razón por la que no se hacen.
