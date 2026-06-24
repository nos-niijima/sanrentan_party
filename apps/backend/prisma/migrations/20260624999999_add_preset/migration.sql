-- CreateTable
CREATE TABLE "Preset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "choices" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Preset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Preset_userId_createdAt_idx" ON "Preset"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Preset" ADD CONSTRAINT "Preset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
