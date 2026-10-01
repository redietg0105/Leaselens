-- Prisma 6 cannot represent an HNSW index on an Unsupported("vector") column, so every
-- `migrate dev` treated the hand-added index from the init migration as drift and tried to drop it.
-- At MVP scale an exact (sequential) cosine scan is fast enough. Revisit when embeddings exceed ~50k rows.
DROP INDEX "embeddings_vector_hnsw_idx";
