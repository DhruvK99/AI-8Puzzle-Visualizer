# How to Run the 8-Puzzle UCS Project

This project is published as a static website on GitHub Pages. For normal use and for an assignment demonstration, **open the live website**. Running a local copy is optional and mainly useful for development or testing code changes.

## 1. Open the live website (recommended)

Visit:

**https://dhruvk99.github.io/AI-8Puzzle-Visualizer/**

No installation, download, or local server is needed. Use a modern browser and an internet connection. The website uses Bootstrap CSS from a CDN.

### Use the application

1. Open **Puzzle Input** from the sidebar.
2. Review or edit the initial and goal boards. The blank may be entered as `_`; internally it is represented by `0`.
3. Check the on-page validation message. You can load a preset or generate a random solvable puzzle.
4. Select **Validate & Solve with UCS** or use the toolbar's **Run UCS** button.
5. Open **Visualizer** to view the board-by-board solution path or the UCS search expansion snapshots.
6. Use Previous, Next, Pause, Resume, Reset and the speed selector to control playback.
7. Open **Search Process** to inspect expansion details and **Solution Summary** to see the final statistics.

Only legal orthogonal blank-tile swaps are allowed: up, down, left and right.

## 2. Run the project locally (optional)

Use these instructions if you want to modify the code or test a local copy.

### Requirements

- A modern browser (Chrome, Firefox, Safari or Edge).
- Python 3 or another static HTTP server.
- An internet connection to load Bootstrap CSS from the CDN.
- Node.js only if you want to run the automated tests from a terminal.

### Extract and open the project folder

Extract the project ZIP and open the `AI-8Puzzle-Visualizer` folder. The terminal must be in the folder that directly contains `index.html`.

### macOS or Linux

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in your browser. Keep the terminal open while using the website. Stop the server with **Ctrl+C**.

### Windows

Open PowerShell or Command Prompt in the project root and run:

```powershell
py -m http.server 8000
```

If `py` is unavailable, try `python -m http.server 8000`. Then open `http://localhost:8000/`.

### If port 8000 is already in use

Use another port:

```bash
python3 -m http.server 8001
```

Then open `http://localhost:8001/`.

## 3. Run the optional automated tests

The automated tests are intended for development checks; visitors do not need to run them to use the live website.

### With Node.js

From the project root, run:

```bash
node assets/test_runner.js
```

### In a browser

With the local server running on port 8000, open:

```text
http://localhost:8000/assets/tests.html
```

Run the tests again after changing puzzle or UCS JavaScript files.

## 4. Troubleshooting

**The page is blank or JavaScript does not load**

- Confirm you opened the live URL or the correct local URL.
- For a local copy, make sure the terminal is in the project root and that the `js` and `css` directories are present.
- Open the browser developer console to inspect errors.

**The page loads without its normal styling**

- Check the internet connection because Bootstrap CSS is loaded from a CDN.
- Reload the page and inspect failed stylesheet requests in the browser's console/network panel.

**The solver reaches the expansion limit**

UCS can be expensive for difficult puzzle configurations. A limit-reached status means the search stopped at its configured safety limit; it does not mean the puzzle is unsolvable.

## 5. GitHub Pages updates

The live website is published from the GitHub repository:

https://github.com/DhruvK99/AI-8Puzzle-Visualizer

After committing and pushing changes to the configured `main` branch, GitHub Pages rebuilds the static site. Wait for the deployment to complete, then refresh the live website and verify the change.
