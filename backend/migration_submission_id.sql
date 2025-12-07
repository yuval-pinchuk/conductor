-- Migration script to change submission_id from INT to VARCHAR(255)
-- Run this in MySQL Workbench or your MySQL client

USE `conductor`;

-- Change the column type from INT to VARCHAR(255)
ALTER TABLE `pending_changes` 
MODIFY COLUMN `submission_id` VARCHAR(255) NOT NULL;

