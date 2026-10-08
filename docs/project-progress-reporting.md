# Reporte de progreso de proyectos

El panel privado `/proyectos/` registra seguimiento administrativo y técnico. No almacena archivos de los sitios: el código, imágenes, repositorios y assets permanecen localmente o en su repositorio Git.

## Regla para futuros proyectos

Cuando Codex complete un avance significativo en un proyecto de cliente de Eventora Studio, deberá actualizar el panel de proyectos mediante el reporter local. No se deben registrar cambios CSS pequeños o ajustes aislados.

Avances significativos incluyen configuración inicial, esqueleto, diseño principal, catálogo o menú, integraciones, galería, ubicación, responsive, QA, revisión del cliente, cambios y publicación.

## Identificación local

Cada sitio puede tener un `.eventora-project.json` en su carpeta de trabajo:

```json
{
  "projectId": "id-del-documento-en-firestore",
  "businessName": "Yogurt Arte Sanar"
}
```

El archivo no contiene contraseñas, tokens, claves privadas ni rutas completas de Windows. `businessName` se compara antes de escribir para evitar actualizar el cliente equivocado.

## Reportar un avance

Desde la carpeta local del sitio, después de confirmar el avance real:

```powershell
node C:\ruta\a\EventoraStudio\scripts\report-project-status.mjs `
  --project id-del-documento `
  --stage skeleton `
  --title "Esqueleto inicial terminado" `
  --description "Se creó navbar, hero y estructura principal." `
  --dry-run
```

Si el resultado es correcto, repetir sin `--dry-run` para escribir el avance. El reporter detecta el commit actual con `git rev-parse --short HEAD`; si la carpeta no es un repositorio Git registra `null`.

Fases válidas: `not-started`, `setup`, `skeleton`, `visual-design`, `content`, `functionality`, `responsive`, `qa`, `client-review`, `revisions`, `final-review`, `ready-to-publish` y `published`.

## Consultar estado

```powershell
node C:\ruta\a\EventoraStudio\scripts\report-project-status.mjs --status --project id-del-documento
```

El reporter usa Application Default Credentials (ADC) localmente. Antes de escribir comprueba que el proyecto de ADC sea `eventorastudio-d6d95`; si no coincide, aborta. Nunca se guardan credenciales en el repositorio.

Flujos:

```text
Navegador /proyectos/ → Firebase Auth + App Check → Functions protegidas → Firestore
Codex / laptop        → reporter local + Admin SDK + ADC → Firestore
```
