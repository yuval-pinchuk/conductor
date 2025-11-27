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

-- Users table
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `project_id` INT NOT NULL,
  `role` VARCHAR(100) NOT NULL,
  `last_login` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_users_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Optional seed data (comment out if not needed)
-- INSERT INTO `projects` (`name`, `version`) VALUES ('Project Alpha', 'v1.2.5');

