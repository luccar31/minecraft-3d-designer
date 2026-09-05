# Deploy

La app es estática: se compila a HTML/JS/CSS y se sirve desde S3 detrás de
CloudFront. Hay tres caminos, y el primero no necesita nada de AWS.

| Camino | Para qué | Requiere |
|---|---|---|
| GitHub Pages | Demo pública, revisar cambios | Nada (activar Pages en el repo) |
| S3 + CloudFront | Producción | Cuenta de AWS + Terraform |
| `dist-single/index.html` | Abrir la app sin servidor | Nada |

---

## 1. GitHub Pages

Ya está el workflow `.github/workflows/pages.yml`. Una sola vez:

**Settings → Pages → Source: GitHub Actions.**

Cada push a `main` publica en `https://<usuario>.github.io/<repo>/`.

---

## 2. S3 + CloudFront

### Qué levanta Terraform

- **Bucket S3 privado**, sin acceso público, cifrado, con versionado y una regla
  de ciclo de vida que expira versiones viejas a los 30 días.
- **CloudFront con Origin Access Control**: el bucket sólo se puede leer a través
  de la distribución, y la política del bucket lo restringe a *esa* distribución
  por ARN.
- **Dos comportamientos de caché**, que es lo que hace que un deploy se vea al
  instante sin perder el cacheo:
  - `/assets/*` → `CachingOptimized`. Los nombres llevan hash, así que se
    cachean un año como inmutables.
  - todo lo demás (`index.html`) → `CachingDisabled`. Es el archivo que apunta
    a los assets nuevos; si se cachea, el deploy no se ve.
- **Fallback de SPA**: 403 y 404 devuelven `/index.html` con código 200.
- **Rol IAM con OIDC** para GitHub Actions, restringido por `sub` a
  `repo:<owner>/<repo>:ref:refs/heads/main`, con permisos sólo sobre ese bucket
  y esa distribución. Sin claves de acceso guardadas como secretos.
- **Dominio propio opcional** con certificado ACM en us-east-1 (CloudFront no
  acepta otro) validado por DNS y un alias en Route 53.

### Aplicarlo

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # ajustá bucket_name, github_repo
terraform init
terraform plan
terraform apply
```

Si tu cuenta **ya tiene** el proveedor OIDC de GitHub (sólo puede haber uno por
cuenta), poné `create_oidc_provider = false` antes de aplicar.

Salidas:

```bash
terraform output
# bucket_name     = "mc-blueprint-a1b2c3d4"
# distribution_id = "E1XXXXXXXXXXXX"
# deploy_role_arn = "arn:aws:iam::123456789012:role/mc-blueprint-github-deploy"
# site_url        = "https://dxxxxxxxxxxxxx.cloudfront.net"
```

### Conectar el repo

En **Settings → Secrets and variables → Actions**, secrets:

| Secret | Valor |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | output `deploy_role_arn` |
| `AWS_S3_BUCKET` | output `bucket_name` |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | output `distribution_id` |
| `VITE_SUPABASE_URL` | opcional, para la persistencia en la nube |
| `VITE_SUPABASE_ANON_KEY` | opcional |

Y como variable (no secret): `AWS_REGION`, si no usás `us-east-1`.

### Qué hace el pipeline

`.github/workflows/deploy-aws.yml`, en cada push a `main`:

1. `npm ci` y build con las variables de Supabase inyectadas.
2. Asume el rol por OIDC (sin claves).
3. **Sube primero los assets** con `Cache-Control: immutable`, y recién después
   el `index.html` con `no-cache`. En ese orden no existe la ventana en la que
   el HTML nuevo pide un asset que todavía no subió.
4. Invalida `/` y `/index.html` en CloudFront y **espera** a que la invalidación
   termine, así el job no se marca verde antes de que el sitio esté servido.

`.github/workflows/ci.yml` corre en cada PR: typecheck, build, tests de
Playwright, y `terraform fmt` + `validate` sobre `infra/`.

### Costo aproximado

Para un sitio personal cae dentro del free tier de CloudFront (1 TB de salida y
10M de requests por mes). Fuera de eso, el gasto real es la salida de datos:
el bundle son ~370 KB comprimidos. S3 guarda unos pocos MB. `PriceClass_100`
(sólo Norteamérica y Europa) es el valor por defecto y el más barato; si querés
baja latencia desde Argentina, subilo a `PriceClass_All`.

### Bajar todo

```bash
cd infra
terraform destroy
```

El bucket tiene `force_destroy = false` a propósito: si tiene objetos, hay que
vaciarlo primero (`aws s3 rm s3://<bucket> --recursive`). Es una red de
seguridad contra borrar el sitio por accidente.

---

## 3. Archivo único

```bash
npm run build:single
```

Genera `dist-single/index.html`: un solo archivo con todo el JS y CSS incrustado.
Se abre con doble click, sin servidor. Sirve para pasarle la app a alguien o
usarla offline. La persistencia sigue siendo el `localStorage` del navegador.
