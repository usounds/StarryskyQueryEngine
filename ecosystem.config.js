module.exports = {
    apps: [
      {
        name: "my-app",
        script: "/opt/StarryskyQueryEngine/src/index.ts",
        interpreter: "ts-node",
        cwd: "/opt/StarryskyQueryEngine", // 作業ディレクトリ
      }
    ]
  };
  