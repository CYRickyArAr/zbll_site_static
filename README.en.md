# ZBLL Algorithm Database

<p align="center">
  <a href="README.md">简体中文</a> | <strong>English</strong>
</p>

An online algorithm database covering **all 472 ZBLL cases**, with top-layer state diagrams, multiple algorithm options, and real-solve usage annotations from top solvers.

ZBLL (Zborowski–Bruchem Last Layer) is an algorithm set that solves the entire Last Layer in one step when all Last Layer edges are already oriented. This site follows the classification used by [pepkin88 zbll-explorer](https://pepkin88.me/zbll-explorer/) and includes all 472 ZBLL cases, with algorithms that have been used in actual solves by **top solvers** including Xuanyi Geng, Tymon Kolasiński, Feliks Zemdegs, Seung Hyuk Nahm, Max Park, and more.

The algorithms are compiled from solve reconstructions on [reco.nz](https://reco.nz/) and solve replay data from **[CubeStation](https://cubestation.com/)** and **[WCU CUBE](https://wcucube.club/)**. **Every algorithm included in the database has a documented record of actual use by a solver** (although it may not be their current go-to algorithm).

The content is provided for learning and reference purposes and will continue to be updated. **If you find an incorrect algorithm or any other issue, feedback and corrections are welcome.**

## Content

- **All 472 ZBLL cases**: each case includes a top-layer state diagram and its corresponding algorithms, with multiple options available for some cases.
- **7 main categories**: H (40 cases), and U / T / L / Pi / S / AS (72 cases each).
- **Real-solve annotations**: each algorithm is labeled with the solvers who have used it; when multiple solvers use the same algorithm, their names are shown together (e.g. "Geng Tymon Fan").
- **Pro Library**: a curated default library based on algorithms actually used in solves by top solvers.
- **Local algorithm libraries**: supports personal copies of the Pro Library, custom libraries, and `.zbll` file import / export.

## Usage

Open the site to browse all categories. After entering a category, click a subcategory title to collapse or expand it, or use the toggle button in the top bar to expand or collapse all sections at once.

The top navigation lets you switch between **Pro** and **Custom** modes and filter algorithms by **All / Learned / Unlearned**.

Open the Local Workspace from the upper-right corner:

- **Default Pro Library**: preview only; browse the complete default library without modifying the original data.
- **Personal Pro Library**: create your own copy of the Default Pro Library, with support for editing notes, ordering, and learned status.
- **Custom Library**: freely edit algorithms, images, and notes.
- **Algorithm selection**: in a Personal Pro Library or Custom Library, select one algorithm per case to keep it highlighted. Each case has its own selection; click the selected algorithm again to clear it. Selection does not change algorithm order and is saved in `.zbll` exports.
- **Import / export `.zbll`**: data is stored locally in the current browser. Export a `.zbll` file for backup or to continue using your library on another device.

> Online: [https://cyrickyarar.github.io/zbll_site_static/](https://cyrickyarar.github.io/zbll_site_static/)
