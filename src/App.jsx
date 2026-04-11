import { Routes, Route } from "react-router-dom";
import Hub from "./Hub.jsx";

const gameModules = import.meta.glob("../games/*.jsx", { eager: true });
const games = Object.values(gameModules).filter((m) => m.meta);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Hub games={games.map((m) => m.meta)} />} />
      {games.map(({ meta, default: Component }) => (
        <Route key={meta.path} path={meta.path} element={<Component />} />
      ))}
    </Routes>
  );
}
