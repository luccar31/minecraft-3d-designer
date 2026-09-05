output "bucket_name" {
  description = "Bucket de S3. Va al secreto AWS_S3_BUCKET del repo."
  value       = aws_s3_bucket.site.id
}

output "distribution_id" {
  description = "Distribución de CloudFront. Va al secreto AWS_CLOUDFRONT_DISTRIBUTION_ID."
  value       = aws_cloudfront_distribution.site.id
}

output "deploy_role_arn" {
  description = "Rol que asume GitHub Actions. Va al secreto AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.deploy.arn
}

output "site_url" {
  description = "URL pública del sitio."
  value       = local.use_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.site.domain_name}"
}
