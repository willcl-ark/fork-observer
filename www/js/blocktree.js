const svgheight = window.innerHeight - d3.select("#drawing-area").node().getBoundingClientRect().height;
const svgwidth = d3.select("body").node().getBoundingClientRect().width;

const getNetworks = new Request('networks.json');

const NODE_SIZE = 125
const MAX_USIZE = 18446744073709551615;

const orientationSelect = d3.select("#orientation")
const networkSelect = d3.select("#network")

const orientations = {
  "bottom-to-top": {
    x: (d, _) => d.x,
    y: (d, htoi) => -htoi[d.data.data.height] * NODE_SIZE,
    linkDir: (htoi) => d3.linkVertical().x(d => o.x(d, htoi)).y(d => o.y(d, htoi)),
    hidden_blocks_text: {offset_x: -40, offset_y: 0, anchor: "left"},
  },
  "left-to-right": {
    x: (d, htoi) => htoi[d.data.data.height] * NODE_SIZE,
    y: (d, _) => d.x,
    linkDir: (htoi) => d3.linkHorizontal().x(d => o.x(d, htoi)).y(d => o.y(d, htoi)),
    hidden_blocks_text: {offset_x: 0, offset_y: 15, anchor: "middle"},
  },
};

let o = orientations["left-to-right"];

const status_to_color = {
  "active": "lime",
  "invalid": "fuchsia",
  "valid-fork": "cyan",
  "valid-headers": "red",
  "headers-only": "yellow",
}

var state_selected_network_id = 0
var state_networks = []
var state_data = {}

function draw() {
  data = state_data
  let block_infos = data.block_infos;
  let tip_infos = data.tip_infos;
  let node_infos = data.nodes;

  nodeid_to_node = {}
  for (const value of node_infos) {
    nodeid_to_node[value.id] = value
  }

  hash_to_tipstatus = {}
  tip_infos.forEach(tip => {
   if (!(tip.hash in hash_to_tipstatus)) {
     hash_to_tipstatus[tip.hash] = {}
   }
   if (!(tip.status in hash_to_tipstatus[tip.hash])) {
     hash_to_tipstatus[tip.hash][tip.status] = { status: tip.status, count: 0, nodes: []  }
   }
   hash_to_tipstatus[tip.hash][tip.status].count++
   hash_to_tipstatus[tip.hash][tip.status].nodes.push(nodeid_to_node[tip.node])
  });

  block_infos.forEach(block_info => {
    let status = hash_to_tipstatus[block_info.hash];
    block_info.status = status == undefined? "in-chain" : Object.values(status)
    block_info.is_tip = status != undefined
  })

  var treeData = d3
    .stratify()
    .id(d => d.id)
    .parentId(function (d) {
      // d3js requires the first prev block hash to be null
      return (d.prev_id == MAX_USIZE ? null : d.prev_id)
    })(block_infos);

  collapseLinearChainsOfBlocks(treeData, 4)

  let unique_heights = Array.from(new Set(treeData.descendants().map(d => parseInt(d.data.height)))).sort((a, b) =>  a - b );
  let htoi = {}; // height to array index map
  for (let index = 0; index < unique_heights.length; index++) {
    const height = unique_heights[index];
    htoi[height] = index;
  }

  let treemap = gen_treemap(o, tip_infos.length, unique_heights);

  // assigns the data to a hierarchy using parent-child relationships
  // and maps the node data to the tree layout
  var root_node = treemap(d3.hierarchy(treeData));

  var svg = d3
    .select("#drawing-area")
    .attr("width", "100%")
    .attr("height", "80vh")
    .style("border", "1px solid")

  svg.selectAll("*").remove()

  // enables zoom and panning
  const zoom = d3.zoom().scaleExtent([0.25, 2]).on( "zoom", e => g.attr("transform", e.transform) )
  svg.call(zoom)

  var g = svg
    .append("g")

  // links between the nodes
  var links = g
    .selectAll(".link-block-block")
    .data(root_node.links())
    .enter()

  // <path> between blocks
  links.append("path")
    .attr("class", "link link-block-block")
    .attr("d", o.linkDir(htoi))
    .attr("stroke-dasharray", d => d.target.data.data.height - d.source.data.data.height == 1 ? "0" : "4 5")

  // text for the not-shown blocks
  var link_texts_hidden_blocks = links
    .filter(d => d.target.data.data.height - d.source.data.data.height != 1)
    .append("text")
    .attr("class", "text-blocks-not-shown")
    .style("text-anchor", o.hidden_blocks_text.anchor)
    .style("font-size", "12px")
    .attr("x", d => o.x(d.target, htoi) - ((o.x(d.target, htoi) - o.x(d.source, htoi))/2) + o.hidden_blocks_text.offset_x )
    .attr("y", d => o.y(d.target, htoi) - ((o.y(d.target, htoi) - o.y(d.source, htoi))/2) + o.hidden_blocks_text.offset_y )
  link_texts_hidden_blocks.append("tspan")
    .text(d => (d.target.data.data.height - d.source.data.data.height -1) + " blocks")
    .attr("dy", ".3em")
  link_texts_hidden_blocks.append("tspan")
    .text("hidden")
    .attr("x", d => o.x(d.target, htoi) - ((o.x(d.target, htoi) - o.x(d.source, htoi))/2) + o.hidden_blocks_text.offset_x )
    .attr("dy", "1em")

  // adds each block as a group
  var blocks = g
    .selectAll(".block-group")
    .data(root_node.descendants())
    .enter()
    .append("g")
    .attr("class", d => "block" + (d.children ? " block--internal" : " block--leaf"))
    .attr("transform", d => "translate(" + o.x(d, htoi) + "," + o.y(d, htoi) + ")")
    .on("click", (c, d) => onBlockClick(c, d))


  function onBlockClick(c, d) {
      let parentElement = d3.select(c.target.parentElement)

      // The on-click listener of the block propagates to the appened description elements.
      // To prevent adding a second description element of the block we return early if the
      // parentElement is not the block.
      if (parentElement.attr("class") == null || !parentElement.attr("class").startsWith("block block--")) return

      if (parentElement.selectAll(".block-description").size() > 0) {
        parentElement.selectAll(".block-description").remove()
        parentElement.selectAll(".link-block-description").attr("d", "")
      } else {

        const description_offset = { x: 50, y: -50 }
        const description_margin = { x: 15, y: 15 }
        let descGroup = parentElement.append("g")
          .attr("class", "block-description")
          .attr("transform", "translate(" + description_offset.x + "," + description_offset.y / 2 + ")")
          .each(d => { d.x = description_offset.x; d.y = description_offset.y })
          .call(
            d3.drag()
              .on("start", dragstarted)
              .on("drag", dragged)
              .on("end", dragended)
          )

        function dragstarted() {d3.select(this).raise().attr("cursor", "grabbing");}
        function dragged(event, d) {
          d.x += event.dx;
          d.y += event.dy;
          var link = d3.linkHorizontal()({
            source: [ 0, 0 ],
            target: [ d.x - description_margin.x / 2, d.y + (descText.node().getBoundingClientRect().height / d3.zoomTransform(svg.node()).k) / 2 ]
          });
          parentElement.selectAll(".link-block-description").attr('d', link)
          d3.select(this).attr("transform", "translate(" + d.x + "," + d.y + ")");
        }
        function dragended() { d3.select(this).attr("cursor", "drag"); }

        let descBackground = descGroup
          .append("rect")
          .attr("class", "block-description-background")
          .attr("x", -description_margin.x / 2)
          .attr("y", -description_margin.y / 2)

        let descText = descGroup
          .append("text")
          .attr("dy", "1em")

        // block description: height
        descText.append("tspan")
          .text("height: " + d.data.data.height)

        // block description: block hash
        descText.append("tspan")
          .text("block hash: ")
          .attr("dy", "1em")
          .attr("x", "0")
        descText.append("tspan")
          .text(d.data.data.hash)
          .on("click", c => document.getSelection().getRangeAt(0).selectNode(c.target))

        // block description: previous hash
        descText.append("tspan")
          .attr("dy", "1em")
          .attr("x", "0")
          .text("previous block: ")
        descText.append("tspan")
          .text(d.data.data.prev_blockhash)
          .on("click", c => document.getSelection().getRangeAt(0).selectNode(c.target))

        // block description: tip status for nodes
        if (d.data.data.status != "in-chain") {
          d.data.data.status.reverse().forEach(status => {
            descText.append("tspan")
              .text("▆ ")
              .attr("dy", "1.2em")
              .attr("x", "0")
              .attr("class", "tip-status-color-fill-"+ status.status)

            descText.append("tspan")
              .text(status.count + "x " + status.status + ": " + status.nodes.map(n => n.name).join(", "))
          })
        }

        descBackground
          .attr("height", (descText.node().getBoundingClientRect().height / d3.zoomTransform(svg.node()).k) + description_margin.y )
          .attr("width", (descText.node().getBoundingClientRect().width / d3.zoomTransform(svg.node()).k) + description_margin.x)
      }
    }

  blocks
    .append('path')
    .attr("class", "link link-block-description") // when modifying, check if there is a depedency on this class name.

  // rect for each block
  const block_size = 50
  blocks
    .append("rect")
    .attr("height", block_size)
    .attr("width", block_size)
    .attr("rx", 5)
    .attr("fill", "white")
    .attr("stroke", "black")
    .attr("stroke-width", "1")
    .attr("transform", "translate("+ (-block_size)/2  +", " + (-block_size)/2 + ")")

  // text for the blocks
  blocks
    .append("text")
    .attr("dy", ".35em")
    .attr("class", "block-text")
    .text(d => d.data.data.height);

  var node_groups = blocks
    .filter(d => d.data.data.status != "in-chain")
    .append("g")
    .selectAll("g")
    .data(d => d.data.data.status)
    .join("g")
    .attr("class", d => "node-indicator")

  // node status indicator
  const indicator_radius = 8
  const indicator_margin = 1
  node_groups.append("rect")
    .attr("width", indicator_radius*2)
    .attr("height", indicator_radius*2)
    .attr("rx", 1)
    .attr("r", indicator_radius)
    .attr("y", -block_size/2 - indicator_radius)
    .attr("x", (d, i) => (block_size/2) - i * (indicator_radius + indicator_margin) * 2 - indicator_radius)
    .attr("class", d => "tip-status-color-fill-" + d.status)

  node_groups.append("text")
    .attr("y", -block_size/2)
    .attr("dx", (d, i) => (block_size/2) - i * (indicator_radius + indicator_margin) * 2)
    .attr("dy", ".35em")
    .attr("class", "node-indicator")
    .text(d => d.count)

  let offset_x = 0;
  let offset_y = 0;
  let max_height = Math.max(...block_infos.map(d => d.height))
  let max_height_tip = root_node.leaves().filter(d => d.data.data.height == max_height)[0]
  if (max_height_tip !== undefined) {
    offset_x = o.x(max_height_tip, htoi);
    offset_y = o.y(max_height_tip, htoi);
  }

  zoom.scaleBy(svg, 1.5);
  zoom.translateTo(svg, offset_x, offset_y, [svgwidth/2,svgheight/2])
}

// recursivly collapses linear branches of blocks longer than x,
// starting from node until all tips are reached.
function collapseLinearChainsOfBlocks(node, x) {
  if (node.children != undefined) {
    for (let index = 0; index < node.children.length; index++) {
      const descendant = node.children[index];
      let nextForkOrTip = findNextForkOrTip(descendant)
      let distance_between_blocks = nextForkOrTip.data.height - descendant.data.height
      if (distance_between_blocks > x) {
        descendant._children = descendant.children;
        descendant.children = [nextForkOrTip.parent];
      }
      collapseLinearChainsOfBlocks(nextForkOrTip, x)
    }
  }
}

function findNextForkOrTip(node) {
  if (node.children == null) {
    // the node is a tip
    return node
  } else if (node.children.length > 1){
    // the node is a fork
    return node
  } else {
    for (const descendant of node) {
      if (descendant.children === undefined || descendant.children.length > 1) {
        return descendant;
      }
    }
  }
}

function gen_treemap(o, tips, unique_heights) {
  return d3.tree().size([tips, unique_heights]).nodeSize([NODE_SIZE, NODE_SIZE]);
}

async function fetch_networks() {
  await fetch(getNetworks)
    .then(response => response.json())
    .then(networks => {
	state_networks = networks.networks

	let first_network_id = state_networks[0].id
	networkSelect.selectAll('option')
	  .data(state_networks)
	  .enter()
	    .append('option')
	    .attr('value', d => d.id)
	    .text(d => d.name)
	    .property("selected", d => d.id == first_network_id)

	state_selected_network_id = state_networks[0].id
    }).catch(console.error);
}

async function fetch_data() {
  await fetch('data.json?network='+networkSelect.node().value)
    .then(response => response.json())
    .then(data => state_data = data)
    .catch(console.error);
}

orientationSelect.on("input", async function() {
  o = orientations[this.value]
  await draw()
})

networkSelect.on("input", async function() {
  state_selected_network_id = networkSelect.node().value
  await fetch_data()
  await draw()
})


// Set the orientation by checking the screen width and height
{
  const supported_orientations = [
    { name: "left to right", value: "left-to-right" },
    { name: "bottom to top", value: "bottom-to-top" }
  ]

  let browser_size_ratio = (window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth) / (window.innerHeight|| document.documentElement.clientHeight|| document.body.clientHeight);

  var choosen_orientation = "left-to-right"
  if (browser_size_ratio < 1) {
    choosen_orientation = "bottom-to-top"
  }

  orientationSelect.selectAll('option')
	  .data(supported_orientations)
	  .enter()
	    .append('option')
	    .attr('value', d => d.value)
	    .text(d => d.name)
	    .property("selected", d => d.value == choosen_orientation)
}
o = orientations[orientationSelect.node().value]

async function run() {
  await fetch_networks()
  await fetch_data()
  await draw()
}

run()

