-- Migration script for database schema updates
-- Run this in MySQL Workbench or your MySQL client

USE `conductor`;

-- Change submission_id from INT to VARCHAR(255)
ALTER TABLE `pending_changes` 
MODIFY COLUMN `submission_id` VARCHAR(255) NOT NULL;

-- Add timer fields for Socket.IO-based collaborative timer
ALTER TABLE `projects`
ADD COLUMN `timer_is_running` TINYINT(1) NOT NULL DEFAULT 0 AFTER `clock_command_timestamp`,
ADD COLUMN `timer_last_start_time` DATETIME NULL AFTER `timer_is_running`,
ADD COLUMN `timer_initial_offset` INT NOT NULL DEFAULT 0 AFTER `timer_last_start_time`,
ADD COLUMN `timer_target_datetime` DATETIME NULL AFTER `timer_initial_offset`;

