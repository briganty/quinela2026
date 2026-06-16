# ⚽ Quiniela Mundial 2026

Aplicación web para llevar la quiniela del Mundial de Fútbol 2026. Importa los datos del Excel
original (partidos, jugadores y pronósticos), calcula la tabla de posiciones y **actualiza los
marcadores automáticamente** tras cada partido vía una API de fútbol.

## Reglas de puntaje

- **Marcador exacto** → 3 puntos
- **Acertar solo el resultado** (ganador o empate) → 1 punto
- Lo demás → 0 puntos

## Quinielas y jugadores

El Excel contiene **dos quinielas independientes**, ambas soportadas en la app:

| Pool | Jugadores | Partidos |
|------|-----------|----------|
| **CASA** | Sammy, Tasha, Tony, Eduardo | los 72 partidos de fase de grupos |
| **ABU**  | Sammy, Tasha, Tony, Nury, Abu, Jared | 25 partidos seleccionados |

## Funcionalidad

- **Posiciones**: tabla de posiciones por pool (puntos, exactos, aciertos de resultado).
- **Pronósticos**: grilla tipo Excel (partidos × jugadores) con cada pronóstico y sus puntos.
- **Calendario**: fixture completo con marcadores oficiales y estado (jugado / en vivo / pendiente).
- Solo lectura: los pronósticos se importan del Excel y quedan fijos.
- Los marcadores oficiales se refrescan solos (ver *Auto-actualización*).

## Arquitectura

- **Backend**: Node + Express, base de datos **SQLite** (`better-sqlite3`), tarea programada
  (`node-cron`) para refrescar resultados.
- **Frontend**: React + Vite (SPA), servido por el mismo Express.
- **Un solo contenedor Docker** (build multi-stage).

```
assets/EXCEL_MUNDIAL.xlsx      Excel original
scripts/import-excel.js        Importador: Excel -> server/data/seed.json
server/                        API Express + SQLite + auto-updater + tests
web/                           Frontend React (Vite)
Dockerfile, docker-compose.yml
```

## Cómo correrlo con Docker

```bash
cp .env.example .env        # (opcional) configura tu API key
docker compose up --build
```

Abre <http://localhost:3000>. La base SQLite se persiste en un volumen (`quiniela-data`) y se
**siembra automáticamente** desde `server/data/seed.json` en el primer arranque.

## Auto-actualización de marcadores

1. Crea una API key gratuita en <https://www.football-data.org/client/register>.
2. Ponla en `.env` como `FOOTBALL_API_KEY=...` y reinicia (`docker compose up -d`).
3. El servidor consulta el proveedor cada 10 minutos (configurable con `POLL_CRON`), casa cada
   partido por nombre de equipo y actualiza el marcador y el estado. La tabla de posiciones se
   recalcula automáticamente.

Si **no** configuras una API key, la app funciona igual usando los resultados ya cargados en el
Excel; el auto-updater queda desactivado.

### Carga manual (respaldo)

Con `ADMIN_TOKEN` definido puedes cargar/corregir un resultado a mano:

```bash
curl -X PUT http://localhost:3000/api/matches/1/result \
  -H "x-admin-token: TU_TOKEN" -H "content-type: application/json" \
  -d '{"home":2,"away":0}'
```

## Desarrollo local (sin Docker)

```bash
# 1. (re)generar el seed desde el Excel
npm install && npm run import

# 2. backend
cd server && npm install && npm start          # :3000

# 3. frontend (otra terminal, con proxy a :3000)
cd web && npm install && npm run dev            # :5173
```

## Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/pools` | lista de pools |
| GET | `/api/pools/:id/standings` | tabla de posiciones |
| GET | `/api/pools/:id/grid` | grilla partidos × jugadores |
| GET | `/api/matches` | fixture con resultados |
| POST | `/api/refresh` | forzar refresco de resultados |
| PUT | `/api/matches/:id/result` | cargar resultado manual (requiere `ADMIN_TOKEN`) |

## Tests

```bash
cd server && npm test
```

Incluye una prueba que verifica que el puntaje calculado **reproduce exactamente** los totales del
Excel para la quiniela CASA (Sammy 11, Tasha 8, Tony 3, Eduardo 0).
