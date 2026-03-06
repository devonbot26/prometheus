const GridMap = {
  maze: new Array(28).fill().map(() => new Array(31).fill(0)),

  tileAt: function(x, y) {
    return this.maze[x][y];
  }
};

export default GridMap;