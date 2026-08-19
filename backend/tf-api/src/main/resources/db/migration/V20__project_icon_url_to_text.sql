-- Migration V20: Change icon_url column from VARCHAR(500) to TEXT
-- Allows storing base64-encoded images (data URLs) for project logos

ALTER TABLE projects
    ALTER COLUMN icon_url TYPE TEXT;
