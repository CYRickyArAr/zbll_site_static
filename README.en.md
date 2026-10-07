# ZBLL Algorithm Database

<p align="center">
  <a href="README.md">简体中文</a> | <strong>English</strong>
</p>

An online algorithm database covering **all 472 ZBLL cases**, with top-layer state diagrams, multiple algorithm options, and real-solve usage annotations from top solvers.

ZBLL (Zborowski–Bruchem Last Layer) is an algorithm set that solves the entire Last Layer in one step when all Last Layer edges are already oriented. This site follows the classification used by [pepkin88 zbll-explorer](https://pepkin88.me/zbll-explorer/) and includes all 472 ZBLL cases, with algorithms that have been used in actual solves by **top solvers** including Xuanyi Geng, Tymon Kolasiński, Feliks Zemdegs, Seung Hyuk Nahm, Max Park, and more.

The algorithms are compiled from solve reconstructions on [reco.nz](https://reco.nz/), [CubeStation](https://cubestation.com/), and [WCU Cube](https://wcucube.club/), with **100% authenticity** (disclaimer: we only guarantee that the algorithms have been used by solvers in actual solves, not that they are their current go-to algorithms).

The content is provided for learning and reference purposes and will continue to be updated. **If you find an incorrect algorithm or any other issue, feedback and corrections are welcome.**

## Content

- **All 472 ZBLL cases**: each case includes a top-layer state diagram and its corresponding algorithms, with multiple options available for some cases.
- **7 main categories**: H (40 cases), and U / T / L / Pi / S / AS (72 cases each).
- **Real-solve annotations**: each algorithm is labeled with the solvers who have used it; when multiple solvers use the same algorithm, their names are shown together (e.g. "Geng Tymon Fan").
- **Default Pro Library**: a curated collection of algorithms used in actual solves by top solvers, available to preview immediately.
- **Personal libraries**: choose which pro algorithms to display and add your own algorithms in the same library. Use `.zbll` files for backups or transfers.

## Usage

### Browsing and choosing a library

Open the site to start browsing. Within a category, use the category labels and subcategory images at the top to switch between groups of cases. Filter by **All / Learned / Unlearned**, or click the site logo in the upper-left corner to return home.

The upper-right button shows the current library name. Click it to open library management:

- **Default Pro Library**: preview only; no personal library is needed to browse. Your first attempt to make a change prompts you to create your own library.
- **Personal libraries**: use the new-library button to create one with all pro algorithms initially visible. Each library lets you choose pro algorithms, add your own, and save images, notes, and learned status. Libraries keep their content and settings independently.
- **Managing libraries**: click a library name to switch to it. Use the menu beside a personal library to rename, export, or delete it.

### Editing and learning

In a personal library, click **Edit** on a case card:

- **Pro algorithms**: check or uncheck individual algorithms to show or hide them, or use **Select all / Select none** for that case. The original algorithms and solver annotations cannot be edited. Hiding an algorithm does not delete it.
- **My algorithms**: click **＋ Add**, enter the algorithm on the left, and optionally enter marks on the right, separated by spaces. You can edit these algorithms at any time. **Delete** removes the entire personal algorithm entry, including its marks.
- **Images and notes**: replace, clear, or restore an image, and add notes. Notes support multiple lines while editing; when browsing, they appear on one line with an ellipsis for overflow.
- **Save / Cancel**: click **Save** to keep your edits, or **Cancel** to discard them.

Use the round check button at the lower-right of a card to toggle learned status. Drag the handle at the upper-right to reorder cases. You can also click one algorithm per case to keep it highlighted; click it again to clear the selection. Selecting an algorithm does not change its order.

### Backups and transfers

Click **Save** after editing, then export a `.zbll` file from the personal library's menu. The file includes your algorithms and marks, each case's pro-algorithm visibility settings, images, notes, learned status, ordering, and algorithm selections.

On another browser or device, open library management and choose **Import .zbll** to restore the file as a separate personal library.

**Personal libraries are stored in the current browser and do not sync automatically across devices. Clearing browser data may erase them, so export backups regularly.**

> Online: [https://cyrickyarar.github.io/zbll_site_static/](https://cyrickyarar.github.io/zbll_site_static/)
