/**
 * Default display shortenings, keyed by the catalog's canonical `label`.
 * Applied only when the user's settings enable shorthand and they haven't
 * set a per-service title override. Anything not listed keeps its label.
 */
const SHORTHAND: Record<string, string> = {
  "Elastic Container Service": "ECS",
  "Elastic Kubernetes Service": "EKS",
  "Elastic Container Registry": "ECR",
  "Simple Queue Service": "SQS",
  "Simple Notification Service": "SNS",
  "Simple Storage Service": "S3",
  "Amazon OpenSearch Service": "OpenSearch",
  "Amazon EventBridge": "EventBridge",
  "Billing and Cost Management": "Billing",
  "Systems Manager": "SSM",
  "Relational Database Service": "RDS",
  "Certificate Manager": "ACM",
  "Key Management Service": "KMS",
  "Secrets Manager": "Secrets",
  "Identity and Access Management": "IAM",
  "Elastic Load Balancing": "ELB",
  "Elastic File System": "EFS",
  "Elastic Beanstalk": "Beanstalk",
};

export function shorten(label: string): string {
  return SHORTHAND[label] ?? label;
}

export const SHORTHAND_MAP = SHORTHAND;
