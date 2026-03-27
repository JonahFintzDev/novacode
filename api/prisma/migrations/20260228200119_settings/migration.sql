/*
  Warnings:

  - Added the required column `enter_to_send` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "enter_to_send" BOOLEAN NOT NULL,
ADD COLUMN     "git_user_email" TEXT,
ADD COLUMN     "git_user_name" TEXT,
ADD COLUMN     "theme" TEXT;
