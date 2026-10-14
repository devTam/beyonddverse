-- AlterTable
ALTER TABLE "content_variants" ADD COLUMN     "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "social_accounts" ALTER COLUMN "encrypted_token" DROP NOT NULL;
