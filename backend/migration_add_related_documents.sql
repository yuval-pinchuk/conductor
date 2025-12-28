-- Migration: Add related_documents table
-- This table stores links to related documents (URLs or local files) for each project

USE `conductor`;

CREATE TABLE IF NOT EXISTS `related_documents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `project_id` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `url` VARCHAR(1000) NOT NULL,
  `is_local_file` TINYINT(1) NOT NULL DEFAULT 0,
  `order_index` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_related_documents_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE,
  INDEX `idx_related_documents_project_id` (`project_id`)
) ENGINE=InnoDB;

