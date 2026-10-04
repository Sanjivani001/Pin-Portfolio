const portfolioItems = [
  {
    title: "Modern Brand Campaign",
    category: "Graphic Design",
    description: "A premium promotional concept designed to elevate a launch with memorable messaging and visual consistency.",
    objective: "Build a memorable visual direction for a sample brand introduction.",
    solution: "Pair a restrained palette with clear campaign hierarchy and adaptable layouts.",
    deliverables: ["Campaign key visual", "Digital promotional layout", "Social-ready artwork"],
    tools: ["Photoshop", "Illustrator", "Branding"],
    image:
      "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1000&q=80"
    ],
    badge: "Sample"
  },
  {
    title: "Business Landing Page",
    category: "Web Design",
    description: "A responsive website concept focused on clarity, modern layout and premium conversion-focused storytelling.",
    objective: "Make a sample business offer easy to understand and navigate across screen sizes.",
    solution: "Use a focused landing-page structure, clear calls to action and a flexible responsive layout.",
    deliverables: ["Page structure", "Responsive UI concept", "Frontend-ready components"],
    tools: ["Figma", "HTML", "UI Design"],
    image:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1000&q=80"
    ],
    badge: "Sample"
  },
  {
    title: "Luxury Wedding Invite",
    category: "Invitations",
    description: "A cinematic invitation concept blending elegant typography, romantic gradients and soft motion cues.",
    objective: "Set a warm, celebratory tone and make event details easy to share.",
    solution: "Combine an elegant type pairing with soft imagery, generous spacing and a story-led sequence.",
    deliverables: ["Invitation visual concept", "Mobile-friendly digital layout", "Motion direction"],
    tools: ["Canva", "Photoshop", "Motion"],
    image:
      "https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=900&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1000&q=80"
    ],
    badge: "Sample"
  },
  {
    title: "Instagram Campaign Kit",
    category: "Social Media",
    description: "A cohesive social creative set built to help a brand stay consistent and engaging across platforms.",
    objective: "Create a consistent sample content system for a social campaign.",
    solution: "Use a repeatable visual grid and flexible artwork formats for a connected feed.",
    deliverables: ["Post concepts", "Carousel layout", "Campaign visual direction"],
    tools: ["Canva", "Adobe Express", "Social"],
    image:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1559028012-481c04fa702d?auto=format&fit=crop&w=1000&q=80"
    ],
    badge: "Sample"
  },
  {
    title: "Pitch Deck Refresh",
    category: "Presentations",
    description: "A clean and persuasive presentation concept that balances content structure with premium design cues.",
    objective: "Make a sample project narrative easy to follow and present with confidence.",
    solution: "Organize the story into clear sections supported by a consistent type and color system.",
    deliverables: ["Presentation cover", "Content slide layouts", "Visual theme"],
    tools: ["PowerPoint", "Design", "Storytelling"],
    image:
      "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1000&q=80"
    ],
    badge: "Sample"
  },
  {
    title: "Brand Visual System",
    category: "Branding",
    description: "A refined branding direction with visual assets crafted to feel memorable, polished and versatile.",
    objective: "Explore a flexible sample visual identity for digital touchpoints.",
    solution: "Build a simple visual language from complementary color, typography and graphic details.",
    deliverables: ["Logo direction", "Brand color palette", "Digital brand assets"],
    tools: ["Branding", "Illustrator", "Identity"],
    image:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1000&q=80"
    ],
    badge: "Sample"
  }
];

const portfolioGrid = document.getElementById("portfolioGrid");
const filterButtons = document.querySelectorAll(".filter-button");
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");
const yearNode = document.getElementById("year");
const chatDialog = document.getElementById("chatPanel");
const chatLauncher = document.querySelector(".chat-launcher");
const chatCloseButton = document.querySelector(".chat-close");
const chatMessages = document.getElementById("chatMessages");
const chatQuickReplies = document.getElementById("chatQuickReplies");
const chatForm = document.getElementById("chatForm");
const chatDetailsForm = document.getElementById("chatDetailsForm");
const chatInput = document.getElementById("chatInput");
const chatError = document.getElementById("chatError");
const chatEmailFallback = document.querySelector(".chat-email-fallback");
const emailLinks = document.querySelectorAll(".email-contact");
const contactEmailStatus = document.querySelector(".contact-email-status");
const projectDialog = document.getElementById("projectDialog");
const projectDialogContent = document.getElementById("projectDialogContent");
const projectDialogClose = document.querySelector(".project-dialog-close");
const chatState = {
  messages: [],
  submitting: false,
  submitted: false
};
let chatOpener = chatLauncher;

const starterOptions = ["Graphic Design", "Website", "Cinematic Invitation", "Presentation", "Something Else"];

function escapeMarkup(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function openProject(project) {
  if (!project) return;
  projectDialogContent.innerHTML = `
    <div class="project-case-hero">
      <img class="project-case-cover" src="${project.image}" alt="${escapeMarkup(project.title)} sample preview" />
      <div class="project-case-heading">
        <span class="portfolio-tag">${escapeMarkup(project.category)}</span>
        <span class="portfolio-badge">Sample concept</span>
        <h2 id="projectDialogTitle">${escapeMarkup(project.title)}</h2>
        <p>${escapeMarkup(project.description)}</p>
      </div>
    </div>
    <div class="project-case-body">
      <div class="project-case-copy">
        <section><h3>Design objective</h3><p>${escapeMarkup(project.objective)}</p></section>
        <section><h3>The solution</h3><p>${escapeMarkup(project.solution)}</p></section>
        <section><h3>Deliverables</h3><ul>${project.deliverables.map((deliverable) => `<li>${escapeMarkup(deliverable)}</li>`).join("")}</ul></section>
        <section><h3>Tools &amp; approach</h3><div class="tools">${project.tools.map((tool) => `<span>${escapeMarkup(tool)}</span>`).join("")}</div></section>
      </div>
      <div class="project-case-gallery" aria-label="More sample project images">${project.gallery.map((image, index) => `<img src="${image}" alt="${escapeMarkup(project.title)} additional sample preview ${index + 1}" loading="lazy" />`).join("")}</div>
      <p class="project-sample-note">This is a sample concept for portfolio presentation, not commissioned client work.</p>
      <button type="button" class="button button-primary discuss-project">Discuss a Similar Project</button>
    </div>`;
  projectDialog.showModal();
  projectDialogContent.querySelector(".discuss-project").addEventListener("click", () => {
    chatDetailsForm.elements.service.value = project.category === "Invitations"
      ? "Cinematic Invitations"
      : project.category === "Web Design" ? "Web Design & Development" : project.category;
    chatDetailsForm.elements.projectDescription.value = `I would like to discuss a project similar to "${project.title}". `;
    projectDialog.addEventListener("close", () => {
      chatOpener = chatLauncher;
      openChat(chatLauncher);
      chatDetailsForm.elements.projectDescription.focus();
    }, { once: true });
    projectDialog.close();
  });
}

function observeReveals(elements = document.querySelectorAll("[data-reveal]")) {
  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries, activeObserver) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        activeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });
  elements.forEach((element) => {
    if (!element.classList.contains("is-visible")) observer.observe(element);
  });
}

function renderPortfolio(items) {
  portfolioGrid.innerHTML = items
    .map(
      (item) => `
        <article class="portfolio-card reveal-item" data-category="${item.category}">
          <div class="portfolio-image"><img src="${item.image}" alt="${item.title} sample project preview" loading="lazy" /></div>
          <div class="portfolio-content">
            <div class="portfolio-top">
              <span class="portfolio-tag">${item.category}</span>
              <span class="portfolio-badge">${item.badge}</span>
            </div>
            <h3>${item.title}</h3>
            <p>${item.description}</p>
            <div class="tools">
              ${item.tools.map((tool) => `<span>${tool}</span>`).join("")}
            </div>
            <button type="button" class="inline-link project-open" data-project-title="${item.title}">View Project</button>
          </div>
        </article>
      `
    )
    .join("");
  observeReveals(portfolioGrid.querySelectorAll(".reveal-item"));
  portfolioGrid.querySelectorAll(".project-open").forEach((button) => {
    button.addEventListener("click", () => openProject(portfolioItems.find((item) => item.title === button.dataset.projectTitle)));
  });
}

function updatePortfolio(filter) {
  const normalized = filter === "All" ? portfolioItems : portfolioItems.filter((item) => item.category === filter);
  renderPortfolio(normalized);

  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === filter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

projectDialogClose.addEventListener("click", () => projectDialog.close());
projectDialog.addEventListener("click", (event) => {
  if (event.target === projectDialog) projectDialog.close();
});

document.querySelectorAll(".service-card, .invitation-card, .process-step, .why-card, .testimonial-card, .about-copy, .about-visual, .contact-copy, .contact-note")
  .forEach((element) => element.setAttribute("data-reveal", ""));
observeReveals();

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    updatePortfolio(button.dataset.filter);
  });
});

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!expanded));
    nav.classList.toggle("nav-open");
  });
}

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

function timestamp() {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date());
}

function scrollChatToLatest() {
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

function appendMessage(author, text) {
  const message = { author, text, time: timestamp() };
  chatState.messages.push(message);

  const row = document.createElement("div");
  row.className = `chat-message chat-message-${author}`;
  const bubble = document.createElement("p");
  bubble.className = "chat-bubble";
  bubble.textContent = text;
  const time = document.createElement("time");
  time.className = "chat-time";
  time.textContent = message.time;
  row.append(bubble, time);
  chatMessages.append(row);
  scrollChatToLatest();
}

function setQuickReplies(options = [], handler = handleVisitorMessage) {
  chatQuickReplies.replaceChildren();
  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-quick-reply";
    button.textContent = option;
    button.addEventListener("click", () => handler(option));
    chatQuickReplies.append(button);
  });
}

function handleVisitorMessage(value) {
  const text = value.trim();
  if (!text || chatState.submitting || chatState.submitted) return;
  appendMessage("visitor", text);
  chatInput.value = "";
  chatError.hidden = true;

  const serviceSelect = chatDetailsForm.elements.service;
  const serviceOptions = {
    "Graphic Design": "Graphic Design",
    Website: "Web Design & Development",
    "Cinematic Invitation": "Cinematic Invitations",
    Presentation: "Presentation Design"
  };
  if (serviceOptions[text]) serviceSelect.value = serviceOptions[text];

  if (text === "Something Else") chatDetailsForm.elements.service.value = "Something Else";
}

function updateComposer() {
  const disabled = chatState.submitting || chatState.submitted;
  chatInput.disabled = disabled;
  chatForm.querySelector(".chat-send").disabled = disabled;
  chatDetailsForm.querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = disabled;
  });
}

function showSubmissionError() {
  chatError.textContent = "Something went wrong while sending your message. Please try again.";
  chatError.hidden = false;
  chatEmailFallback.hidden = false;
}

async function submitEnquiry(event) {
  event.preventDefault();
  if (chatState.submitting || chatState.submitted) return;

  chatError.hidden = true;
  chatEmailFallback.hidden = true;
  const details = new FormData(chatDetailsForm);
  const enquiry = {
    name: String(details.get("name") || "").trim(),
    email: String(details.get("email") || "").trim(),
    phone: String(details.get("phone") || "").trim(),
    service: String(details.get("service") || "").trim(),
    projectType: String(details.get("service") || "").trim(),
    projectDescription: String(details.get("projectDescription") || "").trim(),
    timeline: String(details.get("timeline") || "Not sure yet").trim(),
    budget: String(details.get("budget") || "Not provided").trim(),
    conversation: chatState.messages
  };

  const summary = [
    "Project enquiry details",
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email}`,
    `Service: ${enquiry.service}`,
    `Project: ${enquiry.projectDescription}`,
    `Timeline: ${enquiry.timeline}`,
    `Budget: ${enquiry.budget}`,
    `Phone: ${enquiry.phone || "Not provided"}`
  ].join("\n");
  appendMessage("visitor", summary);
  enquiry.conversation = chatState.messages;
  chatState.submitting = true;
  updateComposer();

  try {
    const response = await fetch("/api/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enquiry)
    });
    if (!response.ok) {
      throw new Error(`Enquiry submission failed with status ${response.status}`);
    }

    chatState.submitted = true;
    appendMessage("assistant", "Thanks! I've received your message. I'll get back to you soon.");
    setQuickReplies(["Start a new conversation"], startNewConversation);
  } catch (error) {
    console.error("Portfolio enquiry could not be sent.", error);
    chatMessages.lastElementChild?.remove();
    chatState.messages.pop();
    const emailAddress = emailLinks[0]?.href.startsWith("mailto:") ? emailLinks[0].href.slice(7) : "";
    if (emailAddress) {
      const transcript = enquiry.conversation
        .map((message) => `${message.author === "visitor" ? enquiry.name : "Sanjivani"} (${message.time}): ${message.text}`)
        .join("\n\n");
      const details = [
        "NEW PORTFOLIO ENQUIRY",
        `Name: ${enquiry.name}`,
        `Email: ${enquiry.email}`,
        `Phone: ${enquiry.phone || "Not provided"}`,
        `Service: ${enquiry.service}`,
        `Project Description: ${enquiry.projectDescription}`,
        `Timeline: ${enquiry.timeline}`,
        `Budget: ${enquiry.budget}`,
        "",
        "Conversation:",
        transcript,
        "",
        `Date/Time: ${new Date().toLocaleString()}`
      ].join("\n");
      chatEmailFallback.href = `mailto:${emailAddress}?subject=${encodeURIComponent("New portfolio enquiry")}&body=${encodeURIComponent(details)}`;
    }
    showSubmissionError();
  } finally {
    chatState.submitting = false;
    updateComposer();
  }
}

function startNewConversation() {
  chatState.messages = [];
  chatState.submitting = false;
  chatState.submitted = false;
  chatMessages.replaceChildren();
  chatDetailsForm.reset();
  chatError.hidden = true;
  chatEmailFallback.hidden = true;
  appendMessage(
    "assistant",
    "Hi! 👋 Thanks for visiting my portfolio. I'd love to hear about your project. What would you like to create?"
  );
  setQuickReplies(starterOptions);
  updateComposer();
  chatInput.focus();
}

function openChat(opener = document.activeElement) {
  if (!chatDialog.open) {
    chatOpener = opener instanceof HTMLElement ? opener : chatLauncher;
    chatDialog.showModal();
    chatOpener.setAttribute("aria-expanded", "true");
    chatInput.focus();
  }
}

chatLauncher.addEventListener("click", openChat);
document.querySelectorAll("[data-open-chat]").forEach((button) => button.addEventListener("click", openChat));
chatCloseButton.addEventListener("click", () => chatDialog.close());
chatDialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    chatDialog.close();
  }
});
chatDialog.addEventListener("close", () => {
  chatOpener.setAttribute("aria-expanded", "false");
  chatOpener.focus();
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleVisitorMessage(chatInput.value);
});
chatDetailsForm.addEventListener("submit", submitEnquiry);

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatEmailFallback.addEventListener("click", (event) => {
  if (chatEmailFallback.getAttribute("aria-disabled") === "true") event.preventDefault();
});
emailLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    if (link.getAttribute("aria-disabled") === "true") event.preventDefault();
  });
});

async function configureEmailLinks() {
  try {
    const response = await fetch("/api/contact");
    if (!response.ok) throw new Error(`Contact configuration request failed with status ${response.status}`);
    const { email } = await response.json();
    if (!email) {
      contactEmailStatus.textContent = "Email contact is not configured yet.";
      return;
    }
    emailLinks.forEach((link) => {
      link.href = `mailto:${email}`;
      link.removeAttribute("aria-disabled");
    });
    contactEmailStatus.textContent = `Email: ${email}`;
  } catch (error) {
    console.error("Could not load email contact configuration.", error);
    contactEmailStatus.textContent = "Email Me is available at sanju010305@gmail.com.";
    emailLinks.forEach((link) => {
      link.href = "mailto:sanju010305@gmail.com";
      link.removeAttribute("aria-disabled");
    });
  }
}

appendMessage(
  "assistant",
  "Hi! 👋 Thanks for visiting my portfolio. I'd love to hear about your project. What would you like to create?"
);
setQuickReplies(starterOptions);
updateComposer();
renderPortfolio(portfolioItems);
configureEmailLinks();
