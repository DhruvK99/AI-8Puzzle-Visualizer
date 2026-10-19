# Running the 8-Puzzle UCS Project

This guide explains how to run the project locally, use the application, run the optional automated test suite, and troubleshoot common setup issues.

## 1. Requirements

For the website itself:

- A modern browser (Chrome, Firefox, Safari, or Edge).
- Python 3 for the simplest local server method, or another local static HTTP server.
- An internet connection to load Bootstrap CSS from the jsDelivr CDN.

Node.js is optional and is only required if you want to run the automated tests from the terminal.

## 2. Extract and open the project folder

1. Extract `AI-8Puzzle-Visualizer.zip`.
2. Open the extracted `AI-8Puzzle-Visualizer` folder.
3. Confirm that `index.html` is in this folder and that the `css`, `js`, `assets`, `images`, and `docs` folders are present.

Do not run commands from the parent folder by mistake; the terminal should be in the directory that directly contains `index.html`.

## 3. Start the website on macOS or Linux

Open Terminal, navigate to the project folder, and run:

```bash
python3 -m http.server 8000
```

For example, if the folder is on your Desktop:

```bash
cd ~/Desktop/AI-8Puzzle-Visualizer
python3 -m http.server 8000
```

Keep the Terminal window open while using the site.

## 4. Start the website on Windows

Open PowerShell or Command Prompt, navigate to the project folder, and run one of these commands:

```powershell
py -m http.server 8000
```

If `py` is unavailable but Python is installed, try:

```powershell
python -m http.server 8000
```

Keep the terminal open while using the site.

## 5. Open the application

Open a browser and visit:

```text
http://localhost:8000/
```

Use the sidebar to navigate between Home, Puzzle Input, Algorithm Selection, Visualizer, Search Process, Solution Summary, and Algorithm Information.

To stop the local server, return to the terminal and press **Ctrl+C**.

### If port 8000 is already in use

Start the server on another port, for example:

```bash
python3 -m http.server 8001
```

Then open `http://localhost:8001/`.

## 6. Use the puzzle solver

1. Open **Puzzle Input**.
2. Set or confirm the initial and goal states. The blank tile can be entered as `_`; internally it is represented by `0`.
3. Use the validation message to check the boards. You may also load a preset or generate a random solvable puzzle.
4. Choose **Validate & Solve with UCS** or use the toolbar's **Run UCS** button.
5. Open **Visualizer** to inspect the board-by-board solution path or search expansion snapshots.
6. Use Previous, Next, Pause, Resume, Reset, and the speed selector to control playback.
7. Open **Search Process** for expansion details and **Solution Summary** for the final statistics.

Only legal orthogonal moves of the blank are permitted: up, down, left, and right.

## 7. Run the optional automated tests

### With Node.js

Install Node.js if it is not already available. Then, from the project root, run:

```bash
node assets/test_runner.js
```

The script prints the test summary and individual results in the terminal.

### In a browser

With the local server running, open:

```text
http://localhost:8000/assets/tests.html
```

Use the results shown by the test page. Rerun tests after changing the JavaScript source files.

## 8. Troubleshooting

**The page is blank or JavaScript does not load**

- Confirm the terminal is in the project root and that you opened `http://localhost:8000/`.
- Check the browser console for errors and verify the `js` and `css` folders are present.
- Refresh the page after code changes.

**The page loads without its normal styling**

- Check your internet connection because Bootstrap CSS is loaded from a CDN.
- Reload the page and look for blocked or failed stylesheet requests in the browser console/network panel.

**Python command not found**

- On macOS/Linux, try `python3 --version`.
- On Windows, try `py --version` or `python --version`.
- Alternatively, use another local static HTTP server.

**The port is busy**

Start the server with a different port such as `8001`, then use the matching localhost URL.

**The solver stops at the expansion limit**

The 8-Puzzle can be expensive for UCS on difficult inputs. A limit-reached status means the search stopped at its configured safety limit; it does not mean the puzzle is unsolvable.

## 9. GitHub Pages

The website can also run on GitHub Pages because it is a static HTML/CSS/JavaScript application.

1. Push the project to the GitHub repository.
2. Open **Settings → Pages** in the repository.
3. Choose **Deploy from a branch**, select `main`, and select the repository root (`/`).
4. Save and wait for GitHub Pages to finish publishing.
5. Open the published URL and confirm the app's CSS, JavaScript, navigation, and solver work.
6. Add the real repository and live-site URLs to the README.

Do not mark deployment complete until the published link has been opened and checked.
