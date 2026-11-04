/**
 * @jest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { ScrollToTop } from "./ScrollToTop";

function Page({ name }: { name: string }) {
  const navigate = useNavigate();
  return (
    <div>
      <span>{name}</span>
      <button onClick={() => navigate("/record/7")}>open</button>
      <button onClick={() => navigate(-1)}>back</button>
    </div>
  );
}

function renderApp() {
  render(
    <MemoryRouter initialEntries={["/search?state=TX"]}>
      <ScrollToTop>
        <Routes>
          <Route path="/search" element={<Page name="list" />} />
          <Route path="/record/:id" element={<Page name="record" />} />
        </Routes>
      </ScrollToTop>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.scrollTo = jest.fn();
});

it("scrolls to the top on a push but not on a history pop", () => {
  // The first location is itself a POP (a load or reload), where the browser
  // restores its own position.
  renderApp();
  expect(window.scrollTo).not.toHaveBeenCalled();

  act(() => screen.getByText("open").click());
  expect(screen.getByText("record")).toBeTruthy();
  expect(window.scrollTo).toHaveBeenCalledTimes(1);

  act(() => screen.getByText("back").click());
  expect(screen.getByText("list")).toBeTruthy();
  expect(window.scrollTo).toHaveBeenCalledTimes(1);
});
