# 🌾 Earth Farm Project

A feature-rich Discord bot that brings farming simulation to your Discord server! Manage your farm, raise animals, trade with other players, and build your agricultural empire.

## ✨ Features

### 🚜 Farm Management

- **Plant & Harvest**: Grow various crops on your farm
- **Farm Upgrades**: Expand and improve your farming capabilities
- **Automated Systems**: Efficient farming operations

### 🐄 Animal Care

- **Barn Management**: Build and manage animal shelters
- **Pet System**: Raise and care for various farm animals
- **Feeding**: Keep your animals healthy and productive

### 💰 Economy System

- **Market Trading**: Buy and sell crops and animals
- **Gold System**: Earn and spend in-game currency
- **Player Trading**: Trade items with other farmers
- **Daily Rewards**: Collect daily bonuses

### 🎮 Gaming Features

- **Scratch Games**: Try your luck with gambling mini-games
- **XP System**: Level up your farming skills
- **Leaderboards**: Compete with other farmers
- **Achievement System**: Track your farming progress

### 🛠️ Utility Commands

- **Help System**: Comprehensive command guidance
- **Avatar Customization**: Personalize your farmer profile
- **Farm Cleaning**: Maintain your farm efficiently

## 🔧 Tech Stack

- **Runtime**: [Bun](https://bun.sh/) - Fast JavaScript runtime
- **Language**: TypeScript
- **Discord Library**: Discord.js v14
- **Database**: MongoDB with Mongoose ODM
- **Caching**: Node-Cache for performance optimization
- **Graphics**: Canvas for image generation
- **Deployment**: Docker containerization
- **Logging**: Pino for structured logging

## 📦 Installation

### Prerequisites

- [Bun](https://bun.sh/) installed on your system
- MongoDB database (local or cloud)
- Discord Bot Token
- Node.js 18+ (for Discord.js compatibility)

### Setup Steps

1. **Clone the repository**

   ```bash
   git clone <your-repository-url>
   cd Earth-Farm-Project
   ```
2. **Install dependencies**

   ```bash
   bun install
   ```
3. **Environment Configuration**
   Create a `.env` file in the root directory:

   ```env
   token=
   clientId=
   mongo_connection=
   GUILD_ID=
   COMMANDS_LOG_CHANNEL_ID=
   TRANSACTION_LOG_CHANNEL_ID=
   ERROR_LOG_CHANNEL_ID=
   ADMIN_USER_ID=
   ```
4. **Database Setup**
   Ensure your MongoDB instance is running and accessible with the provided connection string.

## 🚀 Running the Bot

### Development Mode

```bash
bun run bot
```

This runs the bot with auto-reload on file changes.

### Production Deployment

#### Using Docker (Recommended)

```bash
# Build the Docker image
docker build -t earth-image .

# Run the container
docker run -d --env-file .env --name earth-main-process earth-image
```

#### Using the Deploy Script

```bash
chmod +x deploy.sh
./deploy.sh
```

## 🎯 Commands Overview

### Farm Management

- `/farm` - View and manage your farm
- `/plant` - Plant crops on your farm
- `/harvest` - Harvest mature crops
- `/upgradefarm` - Upgrade your farm facilities

### Animal Care

- `/barn` - Manage your animal barn
- `/pet` - Interact with your animals
- `/feed` - Feed your farm animals
- `/raise` - Add new animals to your farm
- `/unraise` - Remove animals from your farm

### Economy & Trading

- `/market` - Access the marketplace
- `/buy` - Purchase items and animals
- `/sell` - Sell your products
- `/trade` - Trade with other players
- `/gold` - Check your gold balance
- `/daily` - Collect daily rewards

### Gaming & Social

- `/scratch` - Play scratch lottery games
- `/xp` - View your experience points
- `/leaderboard` - See top farmers
- `/farmer` - View farmer profiles

### Utility

- `/help` - Display command help
- `/ping` - Check bot responsiveness
- `/avatar` - Customize your avatar
- `/clean` - Clean up your farm

## 🏗️ Project Structure

```
src/
├── commands/           # All bot commands
│   ├── farm.ts        # Farm management commands
│   ├── barn.ts        # Animal barn commands
│   ├── market.ts      # Trading and marketplace
│   └── ...            # Other command files
├── handlers/          # Event and command handlers
├── database/          # MongoDB connection and methods
│   ├── connect.ts     # Database connection
│   ├── schema.ts      # Data models
│   └── methods.ts     # Database operations
├── utils/             # Utility functions
├── types/             # TypeScript type definitions
├── config/            # Configuration files
├── assets/            # Static assets (images, fonts)
└── index.ts           # Main bot entry point
```

## 🔧 Configuration

### Environment Variables

- `token` - Discord bot token from Discord Developer Portal
- `clientId` - Discord application client ID
- `mongo_connection` - MongoDB connection string
- `GUILD_ID` - Discord server ID where commands are deployed
- `COMMANDS_LOG_CHANNEL_ID` - Discord channel ID for command logging
- `TRANSACTION_LOG_CHANNEL_ID` - Discord channel ID for transaction logging
- `ERROR_LOG_CHANNEL_ID` - Discord channel ID for error logging
- `ADMIN_USER_ID` - Discord user ID with admin privileges

### Bot Permissions

Ensure your bot has the following Discord permissions:

- Send Messages
- Use Slash Commands
- Embed Links
- Attach Files
- Read Message History

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add proper error handling
- Include JSDoc comments for functions
- Test commands thoroughly before submitting
- Use the provided `placeholder.txt` template for new commands

## 📋 Requirements

- Bun runtime
- MongoDB 4.4+
- Discord Bot Token
- At least 512MB RAM for optimal performance

## 🐛 Troubleshooting

### Common Issues

- **Bot not responding**: Check if the bot token is valid and the bot is online
- **Database errors**: Verify MongoDB connection string and database accessibility
- **Command registration**: Ensure proper permissions and bot is in the server

### Support

For support and questions, please open an issue in the repository or contact the development team.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🌟 Acknowledgments

- Discord.js community for excellent documentation
- Bun team for the amazing runtime performance
- MongoDB team for reliable database solutions
- All contributors who help improve this project

---

**Happy Farming! 🌱**
