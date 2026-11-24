CREATE TABLE `anime_favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`contentId` varchar(128) NOT NULL,
	`title` text NOT NULL,
	`poster` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `anime_favorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `favorites_user_content_idx` UNIQUE(`userId`,`contentId`)
);
--> statement-breakpoint
CREATE TABLE `anime_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`contentId` varchar(128) NOT NULL,
	`animeTitle` text NOT NULL,
	`episodeId` varchar(128) NOT NULL,
	`episodeTitle` text NOT NULL,
	`watchedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `anime_history_id` PRIMARY KEY(`id`),
	CONSTRAINT `history_user_episode_idx` UNIQUE(`userId`,`episodeId`)
);
--> statement-breakpoint
ALTER TABLE `anime_favorites` ADD CONSTRAINT `anime_favorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `anime_history` ADD CONSTRAINT `anime_history_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;