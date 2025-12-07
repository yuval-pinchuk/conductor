 -- backend/schema.sql
 -- Run this script in MySQL Workbench to create the Conductor database schema
 
 -- Adjust database name if needed
 CREATE DATABASE IF NOT EXISTS `conductor`
   DEFAULT CHARACTER SET utf8mb4
   DEFAULT COLLATE utf8mb4_unicode_ci;
 
 USE `conductor`;
 
 -- Projects table
 CREATE TABLE `projects` (
   `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL UNIQUE,
  `version` VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
  `manager_password_hash` VARCHAR(255) NULL,
  `manager_role` VARCHAR(100) NULL,
  `clock_command` VARCHAR(50) NULL,
  `clock_command_data` TEXT NULL,
  `clock_command_timestamp` DATETIME NULL,
  `timer_is_running` TINYINT(1) NOT NULL DEFAULT 0,
  `timer_last_start_time` DATETIME NULL,
  `timer_initial_offset` INT NOT NULL DEFAULT 0,
  `timer_target_datetime` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 ) ENGINE=InnoDB;
 
 -- Project roles table
 CREATE TABLE `project_roles` (
   `id` INT AUTO_INCREMENT PRIMARY KEY,
   `project_id` INT NOT NULL,
   `role_name` VARCHAR(100) NOT NULL,
   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
   CONSTRAINT `fk_project_roles_project`
     FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
     ON DELETE CASCADE,
   CONSTRAINT `unique_project_role` UNIQUE (`project_id`, `role_name`)
 ) ENGINE=InnoDB;
 
 -- Phases table
 CREATE TABLE `phases` (
   `id` INT AUTO_INCREMENT PRIMARY KEY,
   `project_id` INT NOT NULL,
   `phase_number` INT NOT NULL,
   `is_active` TINYINT(1) NOT NULL DEFAULT 0,
   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   CONSTRAINT `fk_phases_project`
     FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
     ON DELETE CASCADE,
   CONSTRAINT `unique_project_phase` UNIQUE (`project_id`, `phase_number`)
 ) ENGINE=InnoDB;
 
 -- Rows table
 CREATE TABLE `rows` (
   `id` INT AUTO_INCREMENT PRIMARY KEY,
   `phase_id` INT NOT NULL,
   `role` VARCHAR(100) NOT NULL,
   `time` VARCHAR(20) NOT NULL DEFAULT '00:00:00',
   `duration` VARCHAR(20) NOT NULL DEFAULT '00:00',
   `description` TEXT,
   `script` VARCHAR(500),
   `status` VARCHAR(50) NOT NULL DEFAULT 'N/A',
   `script_result` TINYINT(1),
   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   CONSTRAINT `fk_rows_phase`
     FOREIGN KEY (`phase_id`) REFERENCES `phases`(`id`)
     ON DELETE CASCADE
 ) ENGINE=InnoDB;
 
 -- Periodic scripts table
 CREATE TABLE `periodic_scripts` (
   `id` INT AUTO_INCREMENT PRIMARY KEY,
   `project_id` INT NOT NULL,
   `name` VARCHAR(255) NOT NULL,
   `path` VARCHAR(500) NOT NULL,
   `status` TINYINT(1) NOT NULL DEFAULT 0,
   `last_executed` DATETIME NULL,
   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   CONSTRAINT `fk_periodic_scripts_project`
     FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
     ON DELETE CASCADE
 ) ENGINE=InnoDB;
 
-- Users table (tracks active logins)
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `project_id` INT NOT NULL,
  `role` VARCHAR(100) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `notification_command` VARCHAR(50) NULL,
  `notification_data` TEXT NULL,
  `notification_timestamp` DATETIME NULL,
  `last_login` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_users_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Create unique index for active users only (allows multiple inactive users)
-- Note: MySQL doesn't support partial unique indexes directly, so we'll enforce this in application logic

-- Pending changes table (for non-manager edit requests)
CREATE TABLE `pending_changes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `project_id` INT NOT NULL,
  `submission_id` VARCHAR(255) NOT NULL, -- Groups changes from the same submission
  `submitted_by` VARCHAR(255) NOT NULL,
  `submitted_by_role` VARCHAR(100) NOT NULL,
  `change_type` VARCHAR(50) NOT NULL, -- 'row_add', 'row_update', 'row_delete', 'version', 'role_add', 'role_delete', 'script_add', 'script_update', 'script_delete'
  `changes_data` TEXT NOT NULL, -- JSON string with the changes
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
  `reviewed_by` VARCHAR(255) NULL,
  `reviewed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_pending_changes_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE,
  INDEX `idx_submission_id` (`submission_id`)
) ENGINE=InnoDB;
 
 -- Optional seed data (comment out if not needed)
 -- INSERT INTO `projects` (`name`, `version`) VALUES ('Project Alpha', 'v1.2.5');
 
