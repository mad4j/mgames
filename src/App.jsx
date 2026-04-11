import { Routes, Route } from "react-router-dom";
import Hub from "./Hub.jsx";
import TapGame from "../games/tap-game.jsx";
import VoidGame from "../games/void-game.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Hub />} />
      <Route path="/tap" element={<TapGame />} />
      <Route path="/void" element={<VoidGame />} />
    </Routes>
  );
}
