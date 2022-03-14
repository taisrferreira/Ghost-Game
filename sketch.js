var towerImg, tower;
var doorImg, door, doorsGroup;
var climberImg, climber, climbersGroup;
var ghost, ghostImg;
var gameState = "play"

function preload(){
  towerImg = loadImage("tower.png");
  doorImg = loadImage("door.png");
  climberImg = loadImage("climber.png");
  ghostImg = loadImage("ghost-standing.png");
  spookySound = loadSound("spooky.wav");
}

function setup(){
  createCanvas(600,600);
  spookySound.loop();

  tower = createSprite(300,300);
  tower.addImage("tower",towerImg);
  tower.velocityY = 1;
  
  doorsGroup = new Group();
  climbersGroup = new Group();
    
  ghost = createSprite(300,300,50,50);
  ghost.scale = 0.3;
  ghost.addImage("ghost", ghostImg);
}

function draw(){
  background(0);

  if (gameState === "play") {

    if(keyDown("left_arrow")){
      ghost.x = ghost.x - 3;
    }
    
    if(keyDown("right_arrow")){
      ghost.x = ghost.x + 3;
    }
    
    if(keyDown("space")){
      ghost.velocityY = -10;
    }    
    ghost.velocityY = ghost.velocityY + 0.8
    
    if(tower.y > 400){
      tower.y = 300
    }

    spawnDoors();

    if(climbersGroup.isTouching(ghost) || ghost.y > 600){
      ghost.velocityY = 0;
      ghost.destroy();
      gameState = "end"
    }
        
    drawSprites();
  }
  
  if (gameState === "end"){
    stroke("yellow");
    fill("yellow");
    textSize(30);
    text("Fim de Jogo", 220,300)
  }
}

function spawnDoors() {
  //escreva aqui o código para gerar as portas na torre
  if (frameCount % 300 === 0) {
    var door = createSprite(200, -50);
    var climber = createSprite(200,10);
       
    door.x = Math.round(random(100,400));
    climber.x = door.x;   
    
    door.addImage(doorImg);
    climber.addImage(climberImg);
    
    door.velocityY = 1;
    climber.velocityY = 1;
        
    ghost.depth = door.depth;
    ghost.depth +=1;
   
    //designe tempo de vida a variável
    door.lifetime = 800;
    climber.lifetime = 800;
       
    //adicione cada porta ao grupo
    doorsGroup.add(door);    
    climbersGroup.add(climber);
   
  }
}