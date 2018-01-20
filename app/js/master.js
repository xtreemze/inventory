let ItemsIn = new Set();
let AllItems = new Set();
class item {
  constructor(name) {
    this.name = name;
    this.returned = {
      by: "new item",
      timeStamp: Date.now()
    };

    ItemsIn.add(this);
    AllItems.add(this);
  }

  cardHtml() {
    let item = {};

    if (this.returned) {
      item.button = `<a id="button${this.name}" class="btn-floating halfway-fab waves-effect waves-light green lighten-1">
      <i class="material-icons">playlist_add</i>
    </a>`;
    } else {
      item.button = `<a id="button${this.name}" class="btn-floating halfway-fab waves-effect waves-light orange lighten-1">
      <i class="material-icons">undo</i>
    </a>`;
    }
    let htmlContent =
      `<div id="${this.name}">
  <div class="col s12 m6 l4">
    <div class="card"> 
    <div class="card-image">
      ${(!this.photo ? '<div class="blue lighten-2 display"></div>' : this.photo)}
        <span class="card-title title">${this.name}</span>
        ${item.button}
        </div>
      <div class="card-content">
      <p>
      ${(this.checkedOut ? '<div class="chip"><i class="material-icons tiny">person</i>' + this.checkedOut.by + '</div>' + '<div class="chip"><i class="material-icons tiny">undo</i>' + new Date(this.checkedOut.nextAvailable).toLocaleDateString() + '</div>' : '<div class="chip"> <i class="material-icons tiny">check</i>Available</div>')}
      </p>
      </div>
    </div>
  </div>
</div> `
    this.card = htmlContent;
    return htmlContent;
  }

  cardRender() {
    let domElement = document.getElementById(this.name)
    domElement.outerHTML = this.cardHtml();
    domElement.addEventListener('click', this.action())
  }

  action(personString) {
    if (this.returned) {
      return this.checkOut(personString)
    } else {
      return this.checkIn();
    }
  }

  checkOut(personString) {
    new checkOut(person[personString], this, Date.now())
  }

  checkIn() {
    new checkIn(this);
  }
}

let People = new Set();
class person {
  constructor(name) {
    this.name = name;
    this.itemsCheckedOut = new Set();
    People.add(this);
  }
}

let Log = new Set();
let ItemsOut = new Set();
class checkOut {
  constructor(personArg, itemArg, willReturn) {
    if (ItemsIn.has(itemArg)) {
      itemArg.checkedOut = {
        by: personArg.name,
        on: Date.now(),
        nextAvailable: willReturn
      };
      personArg.itemsCheckedOut.add(itemArg);
      ItemsIn.delete(itemArg);
      ItemsOut.add(itemArg);
    }
    if (itemArg.returned) {
      delete itemArg.returned;
    }
    this.by = personArg.name;
    this.timeStamp = Date.now();
    Log.add(this);
  }
}

class checkIn {
  constructor(itemArg) {
    if (ItemsOut.has(itemArg)) {
      let personWithItem = itemArg.checkedOut.by;
      let set = person[personWithItem].itemsCheckedOut;
      set.delete(itemArg);
      itemArg.returned = {
        by: itemArg.checkedOut.by,
        timeStamp: Date.now()
      };
      delete itemArg.checkedOut;
      ItemsOut.delete(itemArg);
      ItemsIn.add(itemArg);
      this.by = itemArg.returned.by;
    }
    this.timeStamp = Date.now();
    Log.add(this);
  }
}

// Populate Equipment
(function () {
  let equipmentList = [
    "GoPro1",
    "GoPro2",
    "GoPro3",
    "Drone",
    "Cam360",
    "Car"
  ];
  for (let i in equipmentList) {
    let name = equipmentList[i];
    item[name] = new item(equipmentList[i]);
  }
})();

// Pupulate People
(function () {
  let peopleList = [
    "Carlos Velasco",
    "Daniel Åberg",
    "Malin Melén",
    "Johanna Stedt",
    "Mia Kristersson",
    "Peter Ovgren",
    "Laura Parsons",
    "Jimena Castillo",
    "Elena Bazhenova",
    "Per-Inge Persson",
    "Mats Sjöberg",
    "Svarrer Cornelius",
    "Helen Thorn Jönsson",
    "Freddy Kristensson"
  ];

  for (let i in peopleList) {
    let name = peopleList[i];
    person[name] = new person(peopleList[i]);
  }
})();

let populateDom = function () {
  let equipmentDiv = document.getElementById("equipment");
  let htmlContent = ``;
  AllItems.forEach(
    item =>
      (htmlContent += item.cardHtml())
  );
  equipmentDiv.innerHTML = htmlContent;
};



// Checkouts
item["Cam360"].checkOut("Daniel Åberg");
item["GoPro1"].checkOut('Carlos Velasco');

item["GoPro1"].checkIn();

populateDom();

