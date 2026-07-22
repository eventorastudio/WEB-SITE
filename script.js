/*==========================
    PROCESS SECTION
==========================*/

document.addEventListener("DOMContentLoaded", () => {

    const section = document.querySelector(".process");
    const timeline = document.querySelector(".timeline-line");
    const cards = document.querySelectorAll(".process-card");

    if (!section) return;

    const observer = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (!entry.isIntersecting) return;

            timeline.classList.add("animate-line");

            cards.forEach((card, index) => {

                setTimeout(() => {

                    card.classList.add("show");

                }, index * 250);

            });

            observer.unobserve(section);

        });

    }, {
        threshold: 0.35
    });
// ================================
// FEATURES
// ================================

const featuresSection = document.querySelector(".features");
const featureCards = document.querySelectorAll(".feature-card");

if (featuresSection) {

    const featuresObserver = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (!entry.isIntersecting) return;

            featureCards.forEach((card, index) => {

                setTimeout(() => {

                    card.classList.add("show");

                }, index * 120);

            });

            featuresObserver.unobserve(featuresSection);

        });

    }, {
        threshold: 0.2
    });

    featuresObserver.observe(featuresSection);

}
const faqItems = document.querySelectorAll(".faq-item");

faqItems.forEach(item => {

    const button = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");

    if(item.classList.contains("active")){
        answer.style.maxHeight = answer.scrollHeight + "px";
    }

    button.addEventListener("click", () => {

        faqItems.forEach(faq => {

            const otherAnswer = faq.querySelector(".faq-answer");

            if(faq !== item){

                faq.classList.remove("active");
                otherAnswer.style.maxHeight = null;

            }

        });

        item.classList.toggle("active");

        if(item.classList.contains("active")){

            answer.style.maxHeight = answer.scrollHeight + "px";

        }else{

            answer.style.maxHeight = null;

        }

    });

});

/*====================================
LOADER
====================================*/

document.body.classList.add("loading");

window.addEventListener("load",()=>{

    const loader=document.getElementById("loader");

    setTimeout(()=>{

        loader.classList.add("hide");

        document.body.classList.remove("loading");

    },1000);

});
    observer.observe(section);

});