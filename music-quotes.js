(() => {
  const RAW = [
    ["Miles Davis","Do not fear mistakes. There are none."],
    ["Miles Davis","Don't play what's there. Play what's not there."],
    ["Miles Davis","It's not the notes you play; it's the notes you don't play."],
    ["Miles Davis","Sometimes you have to play a long time to be able to play like yourself."],
    ["Miles Davis","When you are creating your own shit, man, even the sky ain't the limit."],
    ["Duke Ellington","A problem is a chance for you to do your best."],
    ["Duke Ellington","There are simply two kinds of music: good music and the other kind."],
    ["Duke Ellington","Gray skies are just clouds passing over."],
    ["Duke Ellington","I merely took the energy it takes to pout and wrote some blues."],
    ["Duke Ellington","Tomorrow is in the wings waiting for you to sound her entrance fanfare."],
    ["Louis Armstrong","What we play is life."],
    ["Louis Armstrong","Musicians don't retire; they stop when there's no more music in them."],
    ["Louis Armstrong","If you have to ask what jazz is, you'll never know."],
    ["Louis Armstrong","Love, baby, love. That's the secret."],
    ["Louis Armstrong","There are some people that if they don't know, you can't tell them."],
    ["Ella Fitzgerald","It isn't where you come from, it's where you're going that counts."],
    ["Ella Fitzgerald","Just don't give up trying to do what you really want to do."],
    ["Ella Fitzgerald","The only thing better than singing is more singing."],
    ["Ella Fitzgerald","Where there is love and inspiration, I don't think you can go wrong."],
    ["Ella Fitzgerald","I stole everything I ever heard, but mostly I stole from the horns."],
    ["John Coltrane","You can play a shoestring if you're sincere."],
    ["John Coltrane","My music is the spiritual expression of what I am."],
    ["John Coltrane","I believe that men are here to grow themselves into the best good they can be."],
    ["John Coltrane","The main thing a musician wants to do is give a picture to the listener."],
    ["John Coltrane","There is never any end. There are always new sounds to imagine."],
    ["Nina Simone","An artist's duty, as far as I'm concerned, is to reflect the times."],
    ["Nina Simone","I'll tell you what freedom is to me: no fear."],
    ["Nina Simone","How can you be an artist and not reflect the times?"],
    ["Nina Simone","You have to learn to get up from the table when love is no longer being served."],
    ["Nina Simone","Life is short. People are not easy to know."],
    ["David Bowie","Tomorrow belongs to those who can hear it coming."],
    ["David Bowie","I don't know where I'm going from here, but I promise it won't be boring."],
    ["David Bowie","Fame itself doesn't really afford you anything more than a good seat in a restaurant."],
    ["David Bowie","I find only freedom in the realms of eccentricity."],
    ["David Bowie","I'm always amazed that people take what I say seriously. I don't even take what I am seriously."],
    ["Bob Dylan","A hero is someone who understands the responsibility that comes with his freedom."],
    ["Bob Dylan","Don't ask me nothin' about nothin'. I just might tell you the truth."],
    ["Bob Dylan","I don't call myself a poet, because I don't like the word."],
    ["Bob Dylan","All I can do is be me, whoever that is."],
    ["Bob Dylan","People seldom do what they believe in. They do what is convenient, then repent."],
    ["Johnny Cash","The best way to say anything is just to say it."],
    ["Johnny Cash","You build on failure. You use it as a stepping stone."],
    ["Johnny Cash","You have to be what you are. Whatever you are, you gotta be it."],
    ["Johnny Cash","Success is having to worry about every damn thing in the world, except money."],
    ["Johnny Cash","I'm not bitter. Why should I be bitter? I'm thrilled to death with life."],
    ["Frank Zappa","Without deviation from the norm, progress is not possible."],
    ["Frank Zappa","The most important thing is not to interfere with somebody else's life."],
    ["Frank Zappa","Music is the best."],
    ["Frank Zappa","Art is making something out of nothing and selling it."],
    ["Frank Zappa","There is more stupidity than hydrogen in the universe, and it has a longer shelf life."],
    ["Lady Gaga","I'm not real. I'm theatre."],
    ["Lady Gaga","I want people to walk around delusional about how great they can be."],
    ["Lady Gaga","You have to be unique, and different, and shine in your own way."],
    ["Lady Gaga","Don't you ever let a soul tell you that you can't be exactly who you are."],
    ["Lady Gaga","Some women choose to follow men, and some women choose to follow their dreams."],
    ["Beyoncé","Power is not given to you. You have to take it."],
    ["Beyoncé","The most alluring thing a woman can have is confidence."],
    ["Beyoncé","Your self-worth is determined by you."],
    ["Beyoncé","I don't like to gamble, but if there's one thing I'm willing to bet on, it's myself."],
    ["Beyoncé","I embrace mistakes. They make you who you are."],
    ["Prince","A strong spirit transcends rules."],
    ["Prince","Despite everything, no one can dictate who you are to other people."],
    ["Prince","Compassion is an action word with no boundaries."],
    ["Prince","Every day I feel is a blessing from God."],
    ["Prince","Can you imagine what I would do if I could do all I can?"],
    ["Dolly Parton","Find out who you are and do it on purpose."],
    ["Dolly Parton","If you don't like the road you're walking, start paving another one."],
    ["Dolly Parton","The way I see it, if you want the rainbow, you gotta put up with the rain."],
    ["Dolly Parton","You'll never do a whole lot unless you're brave enough to try."],
    ["Dolly Parton","I'm not going to limit myself just because people won't accept the fact that I can do something else."],
    ["Jimi Hendrix","Music is my religion."],
    ["Jimi Hendrix","I'm the one that's got to die when it's time for me to die."],
    ["Jimi Hendrix","We want our sound to go into the soul of the audience."],
    ["Jimi Hendrix","I don't really live on compliments."],
    ["Jimi Hendrix","When I die, just keep playing the records."],
    ["Quincy Jones","You have to go to know."],
    ["Quincy Jones","Your music can never be more or less than you are as a human being."],
    ["Quincy Jones","Imagine what a harmonious world it could be if every person shared a little of what they're good at."],
    ["Quincy Jones","I learned real early why God gave us two ears and one mouth."],
    ["Quincy Jones","Great music comes from people who have put their hearts and souls into it."],
    ["Herbie Hancock","I wanted to develop my career so I have the freedom to do what I want."],
    ["Herbie Hancock","Creativity and artistic endeavors have a mission that goes far beyond just making music."],
    ["Herbie Hancock","It's part of life to have obstacles."],
    ["Herbie Hancock","Life is not about finding our limitations; it's about finding our infinity."],
    ["Herbie Hancock","Wisdom and compassion should become the dominating influences in our thoughts, words and actions."],
    ["Brian Eno","Stop thinking about artworks as objects. Start thinking about them as triggers for experiences."],
    ["Brian Eno","As struggles go, being an artist isn't that much of one."],
    ["Brian Eno","Honour thy error as a hidden intention."],
    ["Brian Eno","Repetition is a form of change."],
    ["Brian Eno","The studio is a compositional tool."],
    ["Aretha Franklin","Be your own artist, and always be confident in what you're doing."],
    ["Aretha Franklin","Music does a lot of things for a lot of people."],
    ["Aretha Franklin","Soul is a constant. It's cultural. It's always going to be there."],
    ["Aretha Franklin","Everybody wants respect."],
    ["Aretha Franklin","Trying to grow up is hurting. You make mistakes. You try to learn from them."],
    ["Ray Charles","I was born with music inside me."],
    ["Ray Charles","Music was one of my parts, like my ribs, my kidneys, my liver, my heart."],
    ["Ray Charles","Love is a special word, and I use it only when I mean it."],
    ["Ray Charles","I never wanted to be famous. I only wanted to be great."],
    ["Ray Charles","Music is powerful. As people listen to it, they can be affected."]
  ];

  const QUOTES = RAW.map(([author,text]) => ({ author, text }));

  function install(){
    const rail=document.getElementById('musicQuote');
    if(!rail)return;
    let current=-1;
    const showNext=()=>{
      let index=Math.floor(Math.random()*QUOTES.length);
      if(QUOTES.length>1&&index===current)index=(index+1)%QUOTES.length;
      current=index;
      const quote=QUOTES[index];
      rail.textContent=`“${quote.text}” — ${quote.author}`;
    };
    showNext();
    rail.addEventListener('animationiteration',showNext);
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)setInterval(showNext,18000);
  }

  globalThis.LiveFinderMusicQuotes=QUOTES;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();