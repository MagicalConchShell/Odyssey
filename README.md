<p align="center">
  <img src="./public/Odyssey.png" alt="Odyssey Logo" width="200">
</p>

<h1 align="center">Odyssey</h1>

<p align="center">
  A modern, AI-native desktop application built for developers.
</p>

---

Odyssey is a cross-platform desktop application built with Electron, React, and TypeScript. It aims to seamlessly integrate powerful AI capabilities, a smooth terminal experience, and efficient project management into your daily workflow.

## Key Features

- **Integrated Terminal**: A full-featured terminal based on xterm.js, with support for multiple tabs and customization.
- **AI Assistant**: Seamlessly integrates with large language models like Claude and Gemini to provide intelligent assistance during coding, debugging, and learning.
- **Project Management**: A clean and intuitive project workspace to help you organize and access your projects.

## Quick Start

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or higher recommended)

### Installation & Running

1. **Clone the repository**
    ```bash
    git clone https://github.com/MagicalConchShell/Odyssey.git
    cd Odyssey
    ```

2. **Install dependencies**
    ```bash
    #  export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
    npm install
    npx electron-rebuild
    ```

3. **Start the development server**
    ```bash
    npm run dev
    ```


## Contributing

Contributions of all kinds are welcome! If you have ideas, suggestions, or bug reports, please open an issue or submit a pull request.

## License

This project is licensed under the [Apache 2.0](./LICENSE) License.

## Acknowledgments

- **[Electron](https://www.electronjs.org/)**
- **[Vite](https://vite.dev/)**
- **[shadcn](https://ui.shadcn.com/)**
- **[node-pty](https://github.com/microsoft/node-pty)**
- **[xterm.js](https://github.com/xtermjs/xterm.js)**
