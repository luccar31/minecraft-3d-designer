variable "project" {
  description = "Prefijo de nombres para todos los recursos."
  type        = string
  default     = "mc-blueprint"
}

variable "region" {
  description = "Región del bucket S3."
  type        = string
  default     = "us-east-1"
}

variable "bucket_name" {
  description = "Nombre del bucket. Debe ser único en todo S3. Vacío = se genera con un sufijo aleatorio."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Dominio propio, ej. blueprint.midominio.com. Vacío = se usa el dominio de CloudFront."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Zone ID de Route 53 para el dominio. Requerido si domain_name está seteado."
  type        = string
  default     = ""
}

variable "price_class" {
  description = "Clase de precio de CloudFront. PriceClass_100 = sólo NA + EU, es lo más barato."
  type        = string
  default     = "PriceClass_100"
}

variable "github_repo" {
  description = "Repo autorizado a deployear vía OIDC, en formato owner/repo."
  type        = string
  default     = "luccar31/minecraft-3d-designer"
}

variable "github_branch" {
  description = "Rama desde la que se permite deployear."
  type        = string
  default     = "main"
}

variable "create_oidc_provider" {
  description = "false si el proveedor OIDC de GitHub ya existe en la cuenta (sólo puede haber uno)."
  type        = bool
  default     = true
}
